import { and, eq, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./queries/connection";
import { listings, notifications, orders } from "@db/schema";
import { env } from "./lib/env";

type RefundGatewayInput = {
  orderId: number;
  paymentId: number;
  amount: number;
  idempotencyKey: string;
};

export type RefundGateway = (input: RefundGatewayInput) => Promise<{ refundId: string }>;

export async function refundViaMercadoPago({ paymentId, amount, idempotencyKey }: RefundGatewayInput) {
  if (!env.MP_ACCESS_TOKEN) throw new Error("MP_ACCESS_TOKEN não configurado.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      // Omitting amount requests a full refund; keeping the amount explicit
      // makes the requested value auditable in the provider logs.
      body: JSON.stringify({ amount }),
      signal: controller.signal,
    });
    const body = await response.text();
    let parsed: { id?: string | number } = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      // Keep the HTTP response in the error below without assuming JSON.
    }
    if (!response.ok) {
      throw new Error(`Mercado Pago refund HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    if (parsed.id === undefined || parsed.id === null) {
      throw new Error("Mercado Pago refund não retornou um ID.");
    }
    return { refundId: String(parsed.id) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestOrderRefund(orderId: number, gateway: RefundGateway = refundViaMercadoPago) {
  const db = getDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
  if (order.status !== "disputa") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O pedido não está aguardando resolução de disputa." });
  }
  if (order.refundStatus === "reembolsado") {
    return { status: "reembolsado" as const, refundId: order.mpRefundId, alreadyProcessed: true };
  }
  if (!order.mpPaymentId) {
    const message = "Pedido não possui pagamento Mercado Pago para reembolso.";
    await db.update(orders).set({ refundStatus: "falhou", refundError: message }).where(eq(orders.id, order.id));
    throw new TRPCError({ code: "BAD_REQUEST", message });
  }

  // Claim the refund before calling the provider. A second admin request sees
  // processando and cannot issue a second external refund.
  const claimed = await db.update(orders).set({
    refundStatus: "processando",
    refundError: null,
    refundRequestedAt: new Date(),
    refundAttempts: sql`${orders.refundAttempts} + 1`,
  }).where(and(
    eq(orders.id, order.id),
    eq(orders.status, "disputa"),
    or(eq(orders.refundStatus, "nao_solicitado"), eq(orders.refundStatus, "falhou")),
  ));

  if (!claimed.changes) {
    const [current] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (current?.refundStatus === "reembolsado") {
      return { status: "reembolsado" as const, refundId: current.mpRefundId, alreadyProcessed: true };
    }
    throw new TRPCError({ code: "CONFLICT", message: "Já existe uma tentativa de reembolso em andamento." });
  }

  // Dupla verificação: se o status mudou desde o claim, não prossiga
  const [preCheck] = await db.select({ status: orders.refundStatus }).from(orders).where(eq(orders.id, order.id)).limit(1);
  if (preCheck?.status !== "processando") {
    const [current] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    if (current?.refundStatus === "reembolsado") {
      return { status: "reembolsado" as const, refundId: current.mpRefundId, alreadyProcessed: true };
    }
    throw new TRPCError({ code: "CONFLICT", message: "Estado do reembolso mudou antes da chamada à gateway." });
  }

  try {
    const { refundId } = await gateway({
      orderId: order.id,
      paymentId: order.mpPaymentId,
      amount: order.total,
      idempotencyKey: `nexaccount-refund-order-${order.id}-attempt-${order.refundAttempts}`,
    });
    const completed = await db.update(orders).set({
      status: "reembolsado",
      refundStatus: "reembolsado",
      mpRefundId: refundId,
      refundError: null,
      refundedAt: new Date(),
    }).where(and(eq(orders.id, order.id), eq(orders.status, "disputa"), eq(orders.refundStatus, "processando")));
    if (!completed.changes) {
      // Gateway teve sucesso, mas DB não atualizou (concorrência). Marcar para revisão manual.
      await db.insert(notifications).values({
        userId: 0, // notificação de sistema
        icon: "🚨",
        text: `REEMBOLSO ÓRFÃO: Pedido #${order.id} foi reembolsado no Mercado Pago (refundId=${refundId}) mas o status não foi atualizado. Revisão manual necessária.`,
      });
      throw new Error("Pedido mudou de estado durante a confirmação do reembolso. Reembolso órfão registrado.");
    }

    await db.insert(notifications).values({
      userId: order.buyerId,
      icon: "💸",
      text: `O reembolso do pedido #GX-${4000 + order.id} foi confirmado pelo Mercado Pago.`,
    });

    const [blocking] = await db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.listingId, order.listingId),
          or(
            eq(orders.status, "aguardando"),
            eq(orders.status, "pago"),
            eq(orders.status, "entregue"),
            eq(orders.status, "confirmado"),
            eq(orders.status, "concluido"),
            eq(orders.status, "disputa"),
          ),
        ),
      );
    if (Number(blocking?.n ?? 0) === 0) {
      await db.update(listings).set({ status: "ativo" }).where(eq(listings.id, order.listingId));
    }

    return { status: "reembolsado" as const, refundId, alreadyProcessed: false };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    await db.update(orders).set({
      refundStatus: "falhou",
      refundError: message,
    }).where(and(eq(orders.id, order.id), eq(orders.status, "disputa"), eq(orders.refundStatus, "processando")));
    throw new TRPCError({ code: "BAD_GATEWAY", message: `Reembolso não realizado: ${message}` });
  }
}
