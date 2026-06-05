-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('HUMAN', 'BOT');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'TEAM_CHANNEL');

-- CreateEnum
CREATE TYPE "RoomPhase" AS ENUM ('IDLE', 'DEALING', 'TRIBUTE', 'PLAYING', 'SETTLING', 'FINISHED', 'ABORTED');

-- CreateEnum
CREATE TYPE "MatchKind" AS ENUM ('CASUAL', 'RANKED', 'AI_TRAINING', 'TOURNAMENT');

-- CreateEnum
CREATE TYPE "MatchResult" AS ENUM ('PENDING', 'COMPLETED', 'ABORTED', 'DRAW');

-- CreateEnum
CREATE TYPE "Seat" AS ENUM ('N', 'E', 'S', 'W');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('NS', 'EW');

-- CreateEnum
CREATE TYPE "RefereeAction" AS ENUM ('KICK', 'MUTE', 'UNMUTE', 'PAUSE_MATCH', 'RESUME_MATCH', 'REASSIGN_HOST', 'FORCE_ABORT', 'REVIEW_PLAY');

-- CreateEnum
CREATE TYPE "BanScope" AS ENUM ('ACCOUNT', 'CHAT', 'RANKED', 'TOURNAMENT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('CHEATING', 'COLLUSION', 'ABUSE', 'AFK', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('FRIEND_REQUEST', 'MATCH_INVITE', 'TOURNAMENT_NEWS', 'RANK_PROMOTION', 'REPORT_RESOLVED', 'SYSTEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "aadObjectId" TEXT,
    "kind" "AccountKind" NOT NULL DEFAULT 'HUMAN',
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "tierId" TEXT NOT NULL DEFAULT 'bronze-1',
    "matchesTotal" INTEGER NOT NULL DEFAULT 0,
    "matchesWon" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "visibility" "RoomVisibility" NOT NULL,
    "teamsChannelId" TEXT,
    "teamsTenantId" TEXT,
    "level" TEXT NOT NULL DEFAULT '2',
    "phase" "RoomPhase" NOT NULL DEFAULT 'IDLE',
    "shardNode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "kind" "MatchKind" NOT NULL DEFAULT 'CASUAL',
    "result" "MatchResult" NOT NULL DEFAULT 'PENDING',
    "winnerTeam" TEXT,
    "startLevel" TEXT NOT NULL DEFAULT '2',
    "endLevel" TEXT,
    "hasAiPlayers" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,
    "replayId" TEXT,
    "seasonId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seat" "Seat" NOT NULL,
    "team" "Team" NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "botDifficulty" TEXT,
    "finishOrder" INTEGER,
    "ratingBefore" INTEGER,
    "ratingAfter" INTEGER,
    "ratingDelta" INTEGER,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("matchId","userId")
);

-- CreateTable
CREATE TABLE "replays" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "totalEvents" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "schemaVer" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "replays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" BIGSERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "seat" "Seat",
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minRating" INTEGER NOT NULL,
    "maxRating" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ranking_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_events" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT,
    "seasonId" TEXT,
    "delta" INTEGER NOT NULL,
    "ratingBefore" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "seasonId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "tierId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spectator_logs" (
    "id" BIGSERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "spectator_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referee_logs" (
    "id" BIGSERIAL NOT NULL,
    "refereeId" TEXT NOT NULL,
    "targetId" TEXT,
    "matchId" TEXT,
    "roomId" TEXT,
    "action" "RefereeAction" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referee_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "BanScope" NOT NULL DEFAULT 'ACCOUNT',
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "bans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "matchId" TEXT,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_aadObjectId_key" ON "users"("aadObjectId");

-- CreateIndex
CREATE INDEX "users_tierId_rating_idx" ON "users"("tierId", "rating" DESC);

-- CreateIndex
CREATE INDEX "users_tenantId_status_idx" ON "users"("tenantId", "status");

-- CreateIndex
CREATE INDEX "friendships_toUserId_status_idx" ON "friendships"("toUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_fromUserId_toUserId_key" ON "friendships"("fromUserId", "toUserId");

-- CreateIndex
CREATE INDEX "rooms_phase_createdAt_idx" ON "rooms"("phase", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "rooms_teamsChannelId_idx" ON "rooms"("teamsChannelId");

-- CreateIndex
CREATE INDEX "rooms_visibility_phase_idx" ON "rooms"("visibility", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "matches_replayId_key" ON "matches"("replayId");

-- CreateIndex
CREATE INDEX "matches_startedAt_idx" ON "matches"("startedAt" DESC);

-- CreateIndex
CREATE INDEX "matches_roomId_startedAt_idx" ON "matches"("roomId", "startedAt");

-- CreateIndex
CREATE INDEX "matches_kind_result_finishedAt_idx" ON "matches"("kind", "result", "finishedAt");

-- CreateIndex
CREATE INDEX "matches_seasonId_kind_idx" ON "matches"("seasonId", "kind");

-- CreateIndex
CREATE INDEX "match_players_userId_matchId_idx" ON "match_players"("userId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "match_players_matchId_seat_key" ON "match_players"("matchId", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "replays_matchId_key" ON "replays"("matchId");

-- CreateIndex
CREATE INDEX "match_events_matchId_at_idx" ON "match_events"("matchId", "at");

-- CreateIndex
CREATE INDEX "match_events_at_idx" ON "match_events"("at");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_matchId_seq_key" ON "match_events"("matchId", "seq");

-- CreateIndex
CREATE INDEX "tiers_order_idx" ON "tiers"("order");

-- CreateIndex
CREATE INDEX "ranking_seasons_isActive_idx" ON "ranking_seasons"("isActive");

-- CreateIndex
CREATE INDEX "rating_events_userId_at_idx" ON "rating_events"("userId", "at" DESC);

-- CreateIndex
CREATE INDEX "rating_events_seasonId_at_idx" ON "rating_events"("seasonId", "at");

-- CreateIndex
CREATE INDEX "ranking_snapshots_seasonId_rank_idx" ON "ranking_snapshots"("seasonId", "rank");

-- CreateIndex
CREATE INDEX "ranking_snapshots_seasonId_rating_idx" ON "ranking_snapshots"("seasonId", "rating" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ranking_snapshots_seasonId_userId_takenAt_key" ON "ranking_snapshots"("seasonId", "userId", "takenAt");

-- CreateIndex
CREATE INDEX "spectator_logs_matchId_joinedAt_idx" ON "spectator_logs"("matchId", "joinedAt");

-- CreateIndex
CREATE INDEX "spectator_logs_userId_joinedAt_idx" ON "spectator_logs"("userId", "joinedAt" DESC);

-- CreateIndex
CREATE INDEX "referee_logs_matchId_at_idx" ON "referee_logs"("matchId", "at");

-- CreateIndex
CREATE INDEX "referee_logs_refereeId_at_idx" ON "referee_logs"("refereeId", "at" DESC);

-- CreateIndex
CREATE INDEX "referee_logs_action_at_idx" ON "referee_logs"("action", "at");

-- CreateIndex
CREATE INDEX "bans_userId_scope_expiresAt_idx" ON "bans"("userId", "scope", "expiresAt");

-- CreateIndex
CREATE INDEX "bans_expiresAt_idx" ON "bans"("expiresAt");

-- CreateIndex
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "reports_reportedUserId_createdAt_idx" ON "reports"("reportedUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reports_matchId_idx" ON "reports"("matchId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_at_idx" ON "audit_logs"("actorId", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_replayId_fkey" FOREIGN KEY ("replayId") REFERENCES "replays"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ranking_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_events" ADD CONSTRAINT "rating_events_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ranking_seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_snapshots" ADD CONSTRAINT "ranking_snapshots_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "ranking_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spectator_logs" ADD CONSTRAINT "spectator_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referee_logs" ADD CONSTRAINT "referee_logs_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referee_logs" ADD CONSTRAINT "referee_logs_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bans" ADD CONSTRAINT "bans_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

node.exe : ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
At line:1 char:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (ΓöîΓöÇΓöÇΓöÇΓöÇ...ΓöÇΓöÇΓöÇΓöÇΓöÉ:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
Γöé  Update available 5.22.0 -> 7.8.0                       Γöé
Γöé                                                         Γöé
Γöé  This is a major update - please follow the guide at    Γöé
Γöé  https://pris.ly/d/major-version-upgrade                Γöé
Γöé                                                         Γöé
Γöé  Run the following to update                            Γöé
Γöé    npm i --save-dev prisma@latest                       Γöé
Γöé    npm i @prisma/client@latest                          Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓö
ÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
npm notice
npm notice New minor version of npm available! 11.11.0 -> 11.16.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.16.0
npm notice To update run: npm install -g npm@11.16.0
npm notice
