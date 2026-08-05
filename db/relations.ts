import { relations } from "drizzle-orm";
import {
  users,
  listings,
  favorites,
  orders,
  offers,
  chatThreads,
  chatMessages,
  notifications,
  reviews,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  favorites: many(favorites),
  notifications: many(notifications),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  seller: one(users, { fields: [listings.sellerId], references: [users.id] }),
  reviews: many(reviews),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  listing: one(listings, { fields: [favorites.listingId], references: [listings.id] }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  buyer: one(users, { fields: [orders.buyerId], references: [users.id] }),
  listing: one(listings, { fields: [orders.listingId], references: [listings.id] }),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  listing: one(listings, { fields: [offers.listingId], references: [listings.id] }),
  buyer: one(users, { fields: [offers.buyerId], references: [users.id] }),
}));

export const chatThreadsRelations = relations(chatThreads, ({ many, one }) => ({
  messages: many(chatMessages),
  buyer: one(users, { fields: [chatThreads.buyerId], references: [users.id] }),
  seller: one(users, { fields: [chatThreads.sellerId], references: [users.id] }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, { fields: [chatMessages.threadId], references: [chatThreads.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  listing: one(listings, { fields: [reviews.listingId], references: [listings.id] }),
  author: one(users, { fields: [reviews.authorId], references: [users.id] }),
}));
