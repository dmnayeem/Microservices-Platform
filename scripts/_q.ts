import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaPg } from "@prisma/adapter-pg";

const url =
  (process.env.NODE_ENV !== "production" && process.env.DIRECT_DATABASE_URL) ||
  process.env.DATABASE_URL!;
const isAccelerate =
  url.startsWith("prisma://") || url.startsWith("prisma+postgres://");
export const prisma = new PrismaClient(
  isAccelerate
    ? { accelerateUrl: url }
    : { adapter: new PrismaPg({ connectionString: url }) }
).$extends(withAccelerate());
