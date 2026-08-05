import { MercadoPagoConfig, Payment } from "mercadopago";
import { env } from "./lib/env";
import { getDb } from "./queries/connection";
import { orders, notifications } from "@db/schema";
import { eq } from "drizzle-orm";

let mpClient: MercadoPagoConfig | null = null;
export function getMpClient() {
  if (!mpClient && env.MP_ACCESS_TOKEN) {
    mpClient = new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });
  }
  return mpClient;
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
        email: email || "comprador@contagamer.com.br",
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

export async function processMpWebhook(paymentId: number) {
  const client = getMpClient();
  if (!client) return;

  const payment = new Payment(client);
  const info = await payment.get({ id: paymentId });
  
  if (info.status === "approved" && info.external_reference) {
    const orderId = parseInt(info.external_reference, 10);
    const db = getDb();
    
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (order && order.status === "aguardando") {
      await db.update(orders)
        .set({ status: "inspecao", stage: 2 })
        .where(eq(orders.id, orderId));
        
      await db.insert(notifications).values({
        userId: order.sellerId,
        icon: "💰",
        text: `Pagamento aprovado para o pedido #${orderId}. Libere os dados da conta!`,
      });
      await db.insert(notifications).values({
        userId: order.buyerId,
        icon: "✅",
        text: `Seu pagamento do pedido #${orderId} foi confirmado!`,
      });
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
      email: payerEmail || "comprador@contagamer.com.br",
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
