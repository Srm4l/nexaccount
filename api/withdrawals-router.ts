import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { users, withdrawals } from "@db/schema";
import { createRouter, authedQuery } from "./middleware";
import { notify } from "./queries/notifications";

export const withdrawalsRouter = createRouter({
  requestWithdrawal: authedQuery
    .input(
      z.object({
        amount: z.number().int().positive("Valor deve ser positivo"),
        method: z.enum(["pix", "ted", "payoneer", "crypto"]),
        destinationDetails: z.string().min(3, "Detalhes da chave são obrigatórios"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      }

      if (user.balance < input.amount) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Saldo insuficiente. Você não tem esse valor disponível para saque." 
        });
      }

      // No fees per user request
      const withdrawAmount = input.amount;

      await db.transaction(async (tx) => {
        // Deduct from user balance
        await tx.update(users).set({
          balance: user.balance - withdrawAmount
        }).where(eq(users.id, ctx.user.id));
        
        // Create withdrawal record
        await tx.insert(withdrawals).values({
          userId: ctx.user.id,
          amount: withdrawAmount,
          method: input.method,
          destinationDetails: input.destinationDetails,
          status: "pendente",
        });
      });

      await notify(ctx.user.id, "💸", `Sua solicitação de saque de ${(withdrawAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL'})} foi recebida e está em análise.`);
      
      return { success: true };
    }),

  myWithdrawals: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    return db
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.userId, ctx.user.id))
      .orderBy(desc(withdrawals.id));
  }),
});
