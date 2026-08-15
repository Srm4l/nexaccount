import { MercadoPagoConfig, Payment } from "mercadopago";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { orders, notifications, listings } from "@db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import * as crypto from "node:crypto";

let mpClient: MercadoPagoConfig | null = null;
export function getMpClient() {
  if (!mpClient && env.MP_ACCESS_TOKEN) {
    mpClient = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });
  }
  return mpClient;
}

export function verifyMpWebhookSignature(dataId: string, requestId: string, signature: string, secret: string): boolean {
  try {
    // Formato: "ts=<timestamp>,v1=<signature>"
    const parts = signature.split(",");
    let ts = "";
    let v1 = "";
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "ts") ts = value;
      if (key === "v1") v1 = value;
    }
    if (!ts || !v1) return false;

    // Verificar timestamp (tolerância de 5 minutos)
    const webhookTime = parseInt(ts, 10) * 1000;
    const now = Date.now();
    if (Math.abs(now - webhookTime) > 5 * 60 * 1000) {
      console.warn("Webhook MP: timestamp fora da tolerância");
      return false;
    }

    if (!requestId || !dataId || !Number.isFinite(webhookTime)) return false;
    // Mercado Pago signs a manifest, not the raw JSON body.
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    // Comparação em tempo constante
    const received = Buffer.from(v1, "hex");
    const expected = Buffer.from(expectedSignature, "hex");
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  } catch {
    return false;
  }
}

export async function createPixPayment(orderId: number, title: string, amount: number, email: string) {
  const client = getMpClient();
  if (!client) throw new Error("Mercado Pago não configurado (MP_ACCESS_TOKEN ausente).");

  const payment = new Payment(client);
  
  const response = await payment.create({
    body: {
      transaction_amount: Number(amount.toFixed(2)),
      description: title,
      payment_method_id: "pix",
    payer: {
        email: email || "comprador@nexaccount.com.br",
      },
      external_reference: orderId.toString(),
    },
  });

  if (!response.point_of_interaction?.transaction_data) {
    throw new Error("Erro ao gerar o PIX no Mercado Pago.");
  }

  return {
    qrCodeBase64: response.point_of_interaction.transaction_data.qr_code_base64,
    qrCodeCopiaECola: response.point_of_interaction.transaction_data.qr_code,
    paymentId: response.id,
  };
}

export async function applyApprovedPayment(
  paymentId: number,
  transactionAmount: number,
  externalReference?: string | null,
) {
  const db = getDb();
  let paymentOrders = await db.select().from(orders).where(eq(orders.mpPaymentId, paymentId));

  // Compatibilidade com pedidos antigos e com checkout de pedido único.
  if (paymentOrders.length === 0 && externalReference) {
    const orderId = Number.parseInt(externalReference, 10);
    if (Number.isInteger(orderId) && orderId > 0) {
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (order) paymentOrders = [order];
    }
  }

  if (paymentOrders.length === 0) {
    console.warn(`[mp-webhook] payment_not_linked payment=${paymentId}`);
    return { updatedOrderIds: [], expectedAmount: 0 };
  }

  const expectedAmount = paymentOrders.reduce((sum: number, order: any) => sum + order.total, 0);
  if (!Number.isFinite(transactionAmount) || Math.abs(transactionAmount - expectedAmount) > 0.01) {
    throw new Error(`Pagamento ${paymentId} com valor ${transactionAmount} diferente do checkout ${expectedAmount}`);
  }

  const awaitingOrders = paymentOrders.filter((order: any) => order.status === "aguardando");
  if (awaitingOrders.length === 0) {
    return { updatedOrderIds: [], expectedAmount };
  }

  const awaitingIds = awaitingOrders.map((order: any) => order.id);
  const updated = await db.update(orders)
    .set({ status: "pago", stage: 2, mpPaymentId: paymentId })
    .where(and(inArray(orders.id, awaitingIds), eq(orders.status, "aguardando")));

  if (!updated.changes) {
    return { updatedOrderIds: [], expectedAmount };
  }

  // Notificações atômicas com o update: se falhar, o update é revertido
  try {
    for (const order of awaitingOrders) {
      await db.insert(notifications).values({
        userId: order.sellerId,
        icon: "💰",
        text: `Pagamento aprovado para o pedido #${order.id}. Libere os dados da conta!`,
      });
      await db.insert(notifications).values({
        userId: order.buyerId,
        icon: "✅",
        text: `Seu pagamento do pedido #${order.id} foi confirmado!`,
      });
    }
  } catch (notifyError) {
    console.error(`[mp-webhook] notification_failed payment=${paymentId}`, notifyError);
    throw new Error(`Pagamento processado mas falha ao notificar: ${notifyError}`);
  }

  const listingIds = Array.from(new Set<number>(awaitingOrders.map((order: any) => Number(order.listingId))));
  if (listingIds.length > 0) {
    await db.update(listings).set({ status: "vendido" }).where(inArray(listings.id, listingIds));
  }

  console.info(`[mp-webhook] payment_applied payment=${paymentId} orders=${awaitingIds.join(",")} amount=${transactionAmount}`);
  return { updatedOrderIds: awaitingIds, expectedAmount };
}

export async function processMpWebhook(paymentId: number) {
  const client = getMpClient();
  if (!client) return;

  const payment = new Payment(client);
  const info = await payment.get({ id: paymentId });

  if (info.status === "approved") {
    await applyApprovedPayment(
      paymentId,
      Number(info.transaction_amount),
      info.external_reference,
    );
  } else if (info.status === "rejected" || info.status === "cancelled") {
    const db = getDb();
    const pending = await db.select().from(orders).where(and(eq(orders.mpPaymentId, paymentId), eq(orders.status, "aguardando")));
    if (pending.length === 0) return;

    await db.update(orders)
      .set({ status: "cancelada" })
      .where(and(eq(orders.mpPaymentId, paymentId), eq(orders.status, "aguardando")));

    for (const order of pending) {
      await db.insert(notifications).values({
        userId: order.buyerId,
        icon: "❌",
        text: `O pagamento do pedido #${order.id} não foi aprovado. O anúncio voltou a ficar disponível.`,
      });
      await db.insert(notifications).values({
        userId: order.sellerId,
        icon: "🔄",
        text: `O pagamento do pedido #${order.id} foi recusado. O anúncio voltou a ficar disponível.`,
      });
    }

    const listingIds = Array.from(new Set<number>(pending.map((order: any) => Number(order.listingId))));
    for (const listingId of listingIds) {
      const [blocking] = await db
        .select({ n: sql<number>`count(*)` })
        .from(orders)
        .where(and(eq(orders.listingId, listingId), inArray(orders.status, ["aguardando", "pago", "entregue", "confirmado", "concluido", "disputa"])));
      if (Number(blocking?.n ?? 0) === 0) {
        await db.update(listings).set({ status: "ativo" }).where(eq(listings.id, listingId));
      }
    }
  }
}

export async function createCardPayment(
  orderId: number,
  title: string,
  amount: number,
  token: string,
  paymentMethodId: string,
  installments: number,
  issuerId: string,
  payerEmail: string,
  payerIdentificationType?: string,
  payerIdentificationNumber?: string,
) {
  const client = getMpClient();
  if (!client) throw new Error("Mercado Pago não configurado (MP_ACCESS_TOKEN ausente).");

  const payment = new Payment(client);

  const body: any = {
    transaction_amount: Number(amount.toFixed(2)),
    token,
    description: title,
    installments: Number(installments),
    payment_method_id: paymentMethodId,
      payer: {
      email: payerEmail || "comprador@nexaccount.com.br",
    },
    external_reference: orderId.toString(),
  };

  if (issuerId) {
    body.issuer_id = issuerId;
  }

  if (payerIdentificationType && payerIdentificationNumber) {
    body.payer.identification = {
      type: payerIdentificationType,
      number: payerIdentificationNumber,
    };
  }

  const response = await payment.create({ body });

  return {
    status: response.status, // "approved", "in_process", "rejected"
    statusDetail: response.status_detail,
    paymentId: response.id,
  };
}
