import { CommunityPost, SavedTravelInspiration, Trip } from '../types';
import { TripDraft, writeDraftStore } from './tripPersistence';
import { saveCommunityPosts } from './communityPostPersistence';
import { SAVED_TRAVEL_INSPIRATIONS_STORAGE_KEY, saveSavedTravelInspirations } from './savedTravelInspirationPersistence';

export const OWNERSHIP_MIGRATION_STORAGE_KEY = 'trippie_ownership_migration_v1';

export interface OwnershipMigrationDebug {
  anonymousUserId: string;
  authenticatedUserId: string;
  communityPostsMatched: number;
  communityPostsMigrated: number;
  savedInspirationsMatched: number;
  savedInspirationsMigrated: number;
  tripDraftsOwnedMatched: number;
  tripDraftsMigrated: number;
  tripHistoryOwnedMatched: number;
  tripHistoryMigrated: number;
  legacyUnownedTripDrafts: number;
  legacyUnownedTripHistory: number;
  provenanceChanged: number;
  migrationMarkerWritten: boolean;
}

export interface OwnershipMigrationResult {
  drafts: TripDraft[];
  tripHistory: Trip[];
  communityPosts: CommunityPost[];
  savedTravelInspirations: SavedTravelInspiration[];
  debug: OwnershipMigrationDebug;
}

export const migrateLocalOwnership = ({
  anonymousUserId,
  authenticatedUserId,
  drafts,
  tripHistory,
  communityPosts,
  savedTravelInspirations,
  activeDraftId,
}: {
  anonymousUserId: string;
  authenticatedUserId: string;
  drafts: TripDraft[];
  tripHistory: Trip[];
  communityPosts: CommunityPost[];
  savedTravelInspirations: SavedTravelInspiration[];
  activeDraftId: string | null;
}): OwnershipMigrationResult => {
  const baseDebug: OwnershipMigrationDebug = {
    anonymousUserId, authenticatedUserId, communityPostsMatched: 0, communityPostsMigrated: 0,
    savedInspirationsMatched: 0, savedInspirationsMigrated: 0, tripDraftsOwnedMatched: 0,
    tripDraftsMigrated: 0, tripHistoryOwnedMatched: 0, tripHistoryMigrated: 0,
    legacyUnownedTripDrafts: drafts.filter(draft => !draft.ownerId).length,
    legacyUnownedTripHistory: tripHistory.filter(trip => !trip.ownerId).length,
    provenanceChanged: 0, migrationMarkerWritten: false,
  };
  if (!anonymousUserId || !authenticatedUserId || anonymousUserId === authenticatedUserId) {
    return { drafts, tripHistory, communityPosts, savedTravelInspirations, debug: baseDebug };
  }

  const nextCommunityPosts = communityPosts.map(post => {
    if (post.creatorId !== anonymousUserId) return post;
    baseDebug.communityPostsMatched += 1;
    baseDebug.communityPostsMigrated += 1;
    return { ...post, creatorId: authenticatedUserId };
  });
  const nextSaved = savedTravelInspirations.map(item => {
    if (item.savedByUserId !== anonymousUserId) return item;
    baseDebug.savedInspirationsMatched += 1;
    baseDebug.savedInspirationsMigrated += 1;
    return { ...item, savedByUserId: authenticatedUserId };
  });
  const nextDrafts = drafts.map(draft => {
    if (draft.ownerId !== anonymousUserId) return draft;
    baseDebug.tripDraftsOwnedMatched += 1;
    baseDebug.tripDraftsMigrated += 1;
    return { ...draft, ownerId: authenticatedUserId };
  });
  const nextHistory = tripHistory.map(trip => {
    if (trip.ownerId !== anonymousUserId) return trip;
    baseDebug.tripHistoryOwnedMatched += 1;
    baseDebug.tripHistoryMigrated += 1;
    return { ...trip, ownerId: authenticatedUserId };
  });

  saveCommunityPosts(nextCommunityPosts);
  saveSavedTravelInspirations(nextSaved);
  writeDraftStore(nextDrafts, activeDraftId);
  localStorage.setItem('trippie_history', JSON.stringify(nextHistory));
  const marker = {
    version: 1,
    fromUserId: anonymousUserId,
    toUserId: authenticatedUserId,
    completedAt: new Date().toISOString(),
    migratedCounts: {
      communityPosts: baseDebug.communityPostsMigrated,
      savedInspirations: baseDebug.savedInspirationsMigrated,
      tripDrafts: baseDebug.tripDraftsMigrated,
      tripHistory: baseDebug.tripHistoryMigrated,
    },
  };
  localStorage.setItem(OWNERSHIP_MIGRATION_STORAGE_KEY, JSON.stringify(marker));
  baseDebug.migrationMarkerWritten = true;
  return { drafts: nextDrafts, tripHistory: nextHistory, communityPosts: nextCommunityPosts, savedTravelInspirations: nextSaved, debug: baseDebug };
};
