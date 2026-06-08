-- CreateEnum
CREATE TYPE "GuildRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "GuildMembershipStatus" AS ENUM ('PENDING', 'ACTIVE', 'LEFT', 'KICKED');

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "description" TEXT,
    "maxMembers" INTEGER NOT NULL DEFAULT 50,
    "joinPolicy" TEXT NOT NULL DEFAULT 'APPROVAL',
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "disbandedAt" TIMESTAMP(3),

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_memberships" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GuildRole" NOT NULL DEFAULT 'MEMBER',
    "status" "GuildMembershipStatus" NOT NULL DEFAULT 'PENDING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "guild_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guilds_name_key" ON "guilds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_tag_key" ON "guilds"("tag");

-- CreateIndex
CREATE INDEX "guilds_tenantId_createdAt_idx" ON "guilds"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "guild_memberships_guildId_status_idx" ON "guild_memberships"("guildId", "status");

-- CreateIndex
CREATE INDEX "guild_memberships_userId_status_idx" ON "guild_memberships"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guild_memberships_guildId_userId_key" ON "guild_memberships"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_memberships" ADD CONSTRAINT "guild_memberships_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_memberships" ADD CONSTRAINT "guild_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
