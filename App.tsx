import React, { useState, useEffect, useMemo, useRef } from "react";
import { OVERLAY } from './constants/layers';
import { motion, AnimatePresence } from "motion/react";
import {
  Phase,
  Expense,
  Category,
  Trip,
  PaymentMethod,
  Companion,
  TripMember,
  ShoppingItem,
  TaxRule,
  VisaInfo,
  PublicTrip,
  UserProfile,
  TravelBook,
  ItineraryItem,
  MarketplaceService,
  ServiceRequest,
  InboxMessage,
  FlightAnchor,
  TripFlightMode,
  SavedInspiration,
  PassportProfile,
  TravelRules,
  EntryActionableItem,
  CommunityPost,
  PostComment,
  PostSlice,
  SavedTravelInspiration,
  AuthStatus,
  SettlementBatch,
  FrozenSettlementResult,
  ExpenseProposal,
} from "./types";
import {
  fetchTaxRefundRules,
  parseImageExpenseWithGemini,
  generateTravelBook,
  extractItineraryFromExpenses,
  recommendTrips,
  findCheapestTimes,
} from "./services/geminiService";
import { CATEGORIES_BY_PHASE, COMMON_CURRENCIES } from "./constants";
import PhaseSelector from "./components/PhaseSelector";
import ExpenseForm from "./components/ExpenseForm";
import { useTripSync } from "./hooks/useTripSync";
import { localToday, phaseForDate } from "./services/tripPhaseByDate";
import { PASSPORT_OPTIONS } from "./services/passportOptions";
import { countSaversForPost, saverCountsByPost } from "./services/postSaveCounts";
import {
  deleteComment as deleteRemoteComment,
  deleteCommunityPost as deleteRemotePost,
  fetchComments,
  fetchCommunityPosts,
  pushComment,
  pushCommunityPost,
} from "./services/communitySync";
import { isPushablePost } from "./services/communitySyncMapping";
import {
  buildComment,
  commentsForPost,
  loadPostComments,
  savePostComments,
} from "./services/postComments";
import {
  CustomCategories,
  addCustomCategory,
  loadCustomCategories,
  removeCustomCategory,
  saveCustomCategories,
} from "./services/customCategories";
import {
  destinationLabel,
  detectDestinationFromTripName,
} from "./services/destinationFromTripName";
import { fetchMyTrips, isSyncAvailable } from "./services/tripSync";
import { isOwnerIdentity } from "./services/memberIdentity";
import { filterOutstandingExpenses } from "./services/settlementConsumption";
import {
  migrateLegacyExpenses,
  ownerMemberIdForTrip,
} from "./services/expenseMigration";
import {
  canEditExpense,
  resolveExpenseDeleteRequest,
} from "./services/expensePermissions";
import {
  approveDisputeProposal,
  buildExpenseProposal,
  canRaiseDispute,
  raiseDispute,
  resolveDispute,
  revertDisputeProposal,
  withdrawDispute,
} from "./services/expenseDisputes";
import {
  buildTripRoster,
  memberNameById,
  resolveViewer,
} from "./services/tripRoster";
import { selectSpendingExpenses } from "./services/spendingLedger";
import ExpenseList from "./components/ExpenseList";
import DeleteExpenseConfirmModal from "./components/DeleteExpenseConfirmModal";
import DevViewerSwitcher from "./components/DevViewerSwitcher";
import ConfirmDialog, { ConfirmRequest } from "./components/ConfirmDialog";
import ExpenseDisputeModal from "./components/ExpenseDisputeModal";
import Dashboard from "./components/Dashboard";
import SettlementFlow from "./components/SettlementFlow";
import WalletPhaseSelector, {
  WalletPhase,
} from "./components/WalletPhaseSelector";
import WalletPreScreen from "./components/WalletPreScreen";
import WalletReturnScreen from "./components/WalletReturnScreen";
import RefundSettlementModal from "./components/RefundSettlementModal";
import PreTripChecklist from "./components/PreTripChecklist";
import PostTripChecklist from "./components/PostTripChecklist";
import ShoppingListPanel from "./components/ShoppingListPanel";
import TripSummaryModal from "./components/TripSummaryModal";
import CompanionsModal from "./components/CompanionsModal";
import CountrySettingsModal from "./components/CountrySettingsModal";
import TravelIdentityModal from "./components/TravelIdentityModal";
import TripSelectionScreen from "./components/TripSelectionScreen";
import VisaCheckModal from "./components/VisaCheckModal";
import CommunityFeed from "./components/CommunityFeed";
import CommunityHome from "./components/CommunityHome";
import TravelHome from "./components/TravelHome";
import AppBottomNav, { AppSection } from "./components/AppBottomNav";
import Marketplace from "./components/Marketplace";
import { HelpRequest } from "./services/serviceMatching";
import { spendingProfile, spendingProfileBrief } from "./services/spendingProfile";
import { ActivityPlanProposal } from "./services/activityPlanProposal";
import { PlanEventType, buildPlanEvent, recordPlanEvent } from "./services/planLearningEvents";
import {
  deleteServiceRequest,
  fetchMyServiceRequests,
  publishServiceRequest,
} from "./services/serviceRequests";
import ItineraryCalendar from "./components/ItineraryCalendar";
import ItineraryItemForm from "./components/ItineraryItemForm";
import FlightAnchorsForm from "./components/FlightAnchorsForm";
import ItineraryPlanningAssistant from "./components/ItineraryPlanningAssistant";
import TravelBookView from "./components/TravelBookView";
import PointsDashboard from "./components/PointsDashboard";
import MapExplorer from "./components/MapExplorer";
import {
  Plus,
  CheckCircle,
  Trash2,
  Users,
  Globe,
  ArrowLeft,
  Book,
  Pencil,
  CalendarDays,
  Info,
  Users2,
  ShoppingBag,
  Map as MapIcon,
  Award,
  Sparkles,
  Receipt,
  Share2,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import QRShareModal from "./components/QRShareModal";
import CreateEditTripScreen, {
  TripSetupValues,
} from "./components/CreateEditTripScreen";
import { planTripDeletion } from "./services/tripDeletion";
import {
  dedupeFlightAnchors,
  readDraftStore,
  TripDraft,
  writeDraftStore,
} from "./services/tripPersistence";
import TripWorkspaceShell, {
  WorkspaceSection,
} from "./components/TripWorkspaceShell";
import TripPlanOverview from "./components/TripPlanOverview";
import TripLiveOverview from "./components/TripLiveOverview";
import { resolvePlace } from "./services/placeService";
import {
  fetchPreparationSuggestions,
  PreparationSuggestionRequestError,
} from "./services/preparationSuggestionService";
import { researchTravelRules } from "./services/travelRulesService";
import { classifyLegacyTravelRuleAction } from "./services/travelRuleTaskComposer";
import {
  loadCommunityPosts,
  saveCommunityPosts,
} from "./services/communityPostPersistence";
import {
  loadSavedTravelInspirations,
  saveSavedTravelInspirations,
} from "./services/savedTravelInspirationPersistence";
import TripInspirationPlanner from "./components/TripInspirationPlanner";
import { buildAcceptedItineraryItems } from "./services/itineraryAcceptance";
import { enrichProposalPlaces } from "./services/itineraryPlaceEnrichment";
import type { AdjustmentApplyResult, ProposalAcceptanceResult } from "./components/TripInspirationPlanner";
import {
  applyItineraryAdjustment,
  ItineraryAdjustmentProposal,
} from "./services/itineraryAdjustment";
import {
  itemsForDay,
  moveItemToDay,
  orderItemsForDay,
  reorderWithinDay,
} from "./services/itineraryOrdering";
import { rescheduleFromItem, resequenceDayTimes } from "./services/itineraryTimeline";
import {
  applyFixedEventAdjustment,
  FixedEventAdjustment,
  isFixedItem,
} from "./services/itineraryFixedEvents";
import GlobalActionSheet, {
  GlobalActionContext,
} from "./components/GlobalActionSheet";
import CreateCommunityPostScreen from "./components/CreateCommunityPostScreen";
import CommunityPostDetail from "./components/CommunityPostDetail";
import { fetchPlacePhoto } from "./services/placePhotoService";
import SavedTravelDestinationDetail from "./components/SavedTravelDestinationDetail";
import AccountScreen from "./components/AccountScreen";
import CreatorCenterScreen from "./components/CreatorCenterScreen";
import AuthScreen from "./components/AuthScreen";
import AuthLandingScreen from "./components/AuthLandingScreen";
import {
  fetchProfile,
  getSession,
  signOut,
  subscribeToAuthChanges,
  updateProfile,
  AuthProfile,
} from "./services/authService";
import { supabaseConfigured } from "./services/supabaseClient";
import {
  migrateLocalOwnership,
  OwnershipMigrationDebug,
} from "./services/ownershipMigration";

// Helper to generate unique IDs safe for all environments
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
};

type OwnershipSaveDebug = {
  currentUserIdAtSave: string;
  savedByUserIdInput: string;
  savedObjectSavedByUserId: string;
  storageSavedByUserId: string;
};
type SavePipelineDebug = {
  authStatus: string;
  currentUserId: string;
  confirmClicked: boolean;
  selectedSliceCount: number;
  selectedSliceIds: string[];
  handlerEntered: boolean;
  saveObjectsCreated: number;
  filteredOutCount: number;
  dedupeMatchCount: number;
  stateCountBefore: number;
  stateCountInsideSetterPrev: number;
  stateCountInsideSetterNext: number;
  persistEffectTriggered: boolean;
  countPassedToPersistence: number;
  storageParsedCountAfter: number;
  error: string;
};

// The on-screen diagnostics were built to chase a specific migration bug
// and have sat at the top of four screens ever since. Kept, because that class
// of bug is invisible without them, but off unless deliberately switched on:
// run `localStorage.setItem('trippie:debug', '1')` in the console.
const debugPanelsEnabled = () =>
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  window.localStorage.getItem("trippie:debug") === "1";

const OwnershipDebugPanel: React.FC<{
  authStatus: AuthStatus;
  authUserId?: string;
  anonymousUserId: string;
  currentUserId: string;
  saveDebug: OwnershipSaveDebug;
  pipelineDebug: SavePipelineDebug;
  migrationDebug: OwnershipMigrationDebug | null;
}> = ({
  authStatus,
  authUserId,
  anonymousUserId,
  currentUserId,
  saveDebug,
  pipelineDebug,
  migrationDebug,
}) => {
  const value = (item: string | number | undefined | null) =>
    item === undefined || item === null || item === "" ? "none" : String(item);
  if (!debugPanelsEnabled()) return null;
  return (
    <>
      <section className="w-full border-b border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[10px] leading-4 text-amber-950">
        <strong className="text-[11px]">OWNERSHIP MIGRATION DEBUG</strong>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3">
          <span>authStatus</span>
          <span>{authStatus}</span>
          <span>authUserId</span>
          <span className="truncate">{value(authUserId)}</span>
          <span>anonymousUserId</span>
          <span className="truncate">{anonymousUserId}</span>
          <span>currentUserId</span>
          <span className="truncate">{currentUserId}</span>
          <span>currentUserIdAtSave</span>
          <span className="truncate">
            {value(saveDebug.currentUserIdAtSave)}
          </span>
          <span>savedByUserIdInput</span>
          <span className="truncate">
            {value(saveDebug.savedByUserIdInput)}
          </span>
          <span>savedObjectSavedByUserId</span>
          <span className="truncate">
            {value(saveDebug.savedObjectSavedByUserId)}
          </span>
          <span>storageSavedByUserId</span>
          <span className="truncate">
            {value(saveDebug.storageSavedByUserId)}
          </span>
          <span>matchingSavedCount</span>
          <span>{migrationDebug?.savedInspirationsMatched ?? 0}</span>
          <span>migratedSavedCount</span>
          <span>{migrationDebug?.savedInspirationsMigrated ?? 0}</span>
          <span>ownerAfterMigration</span>
          <span className="truncate">
            {value(migrationDebug?.authenticatedUserId)}
          </span>
          <span>communityPostsMatched</span>
          <span>{migrationDebug?.communityPostsMatched ?? 0}</span>
          <span>communityPostsMigrated</span>
          <span>{migrationDebug?.communityPostsMigrated ?? 0}</span>
          <span>tripDraftsOwnedMatched</span>
          <span>{migrationDebug?.tripDraftsOwnedMatched ?? 0}</span>
          <span>tripDraftsMigrated</span>
          <span>{migrationDebug?.tripDraftsMigrated ?? 0}</span>
          <span>tripHistoryOwnedMatched</span>
          <span>{migrationDebug?.tripHistoryOwnedMatched ?? 0}</span>
          <span>tripHistoryMigrated</span>
          <span>{migrationDebug?.tripHistoryMigrated ?? 0}</span>
          <span>legacyUnownedTripDrafts</span>
          <span>{migrationDebug?.legacyUnownedTripDrafts ?? 0}</span>
          <span>legacyUnownedTripHistory</span>
          <span>{migrationDebug?.legacyUnownedTripHistory ?? 0}</span>
          <span>provenanceChanged</span>
          <span>{migrationDebug?.provenanceChanged ?? 0}</span>
          <span>migrationMarkerWritten</span>
          <span>{migrationDebug?.migrationMarkerWritten ? "YES" : "NO"}</span>
          <span>markerFromUserId</span>
          <span className="truncate">
            {value(migrationDebug?.anonymousUserId)}
          </span>
          <span>markerToUserId</span>
          <span className="truncate">
            {value(migrationDebug?.authenticatedUserId)}
          </span>
        </div>
      </section>
      <section className="w-full border-b border-sky-300 bg-sky-50 px-3 py-2 font-mono text-[10px] leading-4 text-sky-950">
        <strong className="text-[11px]">SAVE PIPELINE DEBUG</strong>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-x-3">
          <span>authStatus</span>
          <span>{pipelineDebug.authStatus}</span>
          <span>currentUserId</span>
          <span className="truncate">{pipelineDebug.currentUserId}</span>
          <span>confirmClicked</span>
          <span>{pipelineDebug.confirmClicked ? "YES" : "NO"}</span>
          <span>selectedSliceCount</span>
          <span>{pipelineDebug.selectedSliceCount}</span>
          <span>selectedSliceIds</span>
          <span className="truncate">
            {pipelineDebug.selectedSliceIds.join(", ") || "none"}
          </span>
          <span>handlerEntered</span>
          <span>{pipelineDebug.handlerEntered ? "YES" : "NO"}</span>
          <span>saveObjectsCreated</span>
          <span>{pipelineDebug.saveObjectsCreated}</span>
          <span>filteredOutCount</span>
          <span>{pipelineDebug.filteredOutCount}</span>
          <span>dedupeMatchCount</span>
          <span>{pipelineDebug.dedupeMatchCount}</span>
          <span>stateCountBefore</span>
          <span>{pipelineDebug.stateCountBefore}</span>
          <span>setterPrev</span>
          <span>{pipelineDebug.stateCountInsideSetterPrev}</span>
          <span>setterNext</span>
          <span>{pipelineDebug.stateCountInsideSetterNext}</span>
          <span>persistEffectTriggered</span>
          <span>{pipelineDebug.persistEffectTriggered ? "YES" : "NO"}</span>
          <span>countPassedToPersistence</span>
          <span>{pipelineDebug.countPassedToPersistence}</span>
          <span>storageParsedCountAfter</span>
          <span>{pipelineDebug.storageParsedCountAfter}</span>
          <span>error</span>
          <span>{pipelineDebug.error || "none"}</span>
        </div>
      </section>
    </>
  );
};

const mergeTravelRuleActionsIntoShoppingList = (
  previous: ShoppingItem[],
  actions: EntryActionableItem[],
): ShoppingItem[] => {
  const knownActions = actions.filter(
    (action) => action.actionType !== "other",
  );
  const result = [...previous];
  knownActions.forEach((action) => {
    const typedMatches = result.filter(
      (item) =>
        item.sourceType === "travel_rules" &&
        item.travelRuleActionType === action.actionType,
    );
    const legacyMatch =
      typedMatches.length === 0
        ? result.find(
            (item) =>
              classifyLegacyTravelRuleAction(item.name) === action.actionType &&
              !item.sourceType,
          )
        : undefined;
    const existing = typedMatches[0] || legacyMatch;
    if (existing) {
      const updated = {
        ...existing,
        name: action.title,
        sourceType: "travel_rules" as const,
        travelRuleActionType: action.actionType,
        description: action.description || existing.description,
        timingText: action.timingText || existing.timingText,
        source: action.source || existing.source,
      };
      result[result.indexOf(existing)] = updated;
      typedMatches.slice(1).forEach((duplicate) => {
        result.splice(result.indexOf(duplicate), 1);
      });
    } else {
      result.push({
        id: generateId(),
        name: action.title,
        isPurchased: false,
        phase: "pre",
        sourceType: "travel_rules",
        travelRuleActionType: action.actionType,
        description: action.description,
        timingText: action.timingText,
        source: action.source,
      });
    }
  });
  actions
    .filter((action) => action.actionType === "other")
    .forEach((action) => {
      const existing = result.find(
        (item) =>
          item.sourceType === "travel_rules" &&
          item.travelRuleActionType === "other" &&
          item.name.trim().toLowerCase() === action.title.trim().toLowerCase(),
      );
      if (!existing)
        result.push({
          id: generateId(),
          name: action.title,
          isPurchased: false,
          phase: "pre",
          sourceType: "travel_rules",
          travelRuleActionType: "other",
          description: action.description,
          timingText: action.timingText,
          source: action.source,
        });
    });
  return result;
};

const getReliableDraftName = (name: string) => {
  const normalizedName = name.trim();
  if (
    !normalizedName ||
    /^(?:destination\s*tbd|tbd|unknown|n\/?a)$/i.test(normalizedName)
  ) {
    return null;
  }
  return normalizedName;
};

// Helper to calculate date range from expenses (Fallback if no explicit date set)
const getExpenseDateRange = (expensesList: Expense[]) => {
  if (expensesList.length === 0) {
    return { start: "", end: "" };
  }
  const sorted = [...expensesList].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  return { start: sorted[0].date, end: sorted[sorted.length - 1].date };
};

// Helper to format date range for display (e.g. 2024/01/01 - 01/05)
const formatDateRange = (s: string, e: string) => {
  if (!s || !e) return "";
  const start = s.split("T")[0].replace(/-/g, "/");
  const end = e.split("T")[0].replace(/-/g, "/");
  if (start === end) return start;
  // Check if same year
  if (start.substring(0, 4) === end.substring(0, 4)) {
    return `${start} - ${end.substring(5)}`;
  }
  return `${start} - ${end}`;
};

// Helper to migrate legacy expenses. Every call site knows its trip/draft id,
// so the canonical owner TripMember id is derived rather than guessed; without
// one the legacy "me" default is kept unchanged.
const migrateExpenses = (data: any[], tripId?: string): Expense[] =>
  migrateLegacyExpenses(data, ownerMemberIdForTrip(tripId));

// The roster is now derived in one place (services/tripRoster) so member typing,
// owner-shaped id rejection and viewer resolution cannot drift between the
// eight call sites that need a member list.
const buildTripMembers = (
  tripId: string,
  ownerId: string | undefined,
  ownerName: string,
  companions: Companion[],
  friends: Companion[] = [],
): TripMember[] =>
  buildTripRoster({
    tripId,
    ownerUserId: ownerId,
    ownerName,
    companions,
    friends,
  });

// Helper to migrate legacy shopping list
const migrateShoppingList = (data: any[]): ShoppingItem[] => {
  return data.map((item) => ({
    ...item,
    phase: item.phase || "pre", // Default legacy items to 'pre'
  }));
};

const App: React.FC = () => {
  // Navigation State
  const [viewMode, setViewMode] = useState<
    | "bookshelf"
    | "tripSetup"
    | "trip"
    | "community"
    | "marketplace"
    | "points"
    | "map"
  >("community");
  const [appSection, setAppSection] = useState<AppSection>("community");
  const [communityPosts, setCommunityPosts] =
    useState<CommunityPost[]>(loadCommunityPosts);
  const [savedTravelInspirations, setSavedTravelInspirations] = useState<
    SavedTravelInspiration[]
  >(loadSavedTravelInspirations);
  const [communityView, setCommunityView] = useState<
    "home" | "create" | "detail"
  >("home");
  const [selectedCommunityPostId, setSelectedCommunityPostId] = useState<
    string | null
  >(null);
  const [selectedSavedDestination, setSelectedSavedDestination] = useState<{
    country: string;
    city: string;
  } | null>(null);
  // Destination context carried from a saved-destination page into the existing
  // Create Trip flow. Prefill only — nothing is persisted until the user submits.
  const [pendingTripDestination, setPendingTripDestination] = useState<{
    country: string;
    city: string;
  } | null>(null);

  // The prefill belongs to one visit to the setup screen. Clearing it on exit
  // covers every route out — back, submit, and the AI-planner shortcut alike — so
  // it can never bleed into an unrelated trip created later.
  useEffect(() => {
    if (viewMode !== "tripSetup") setPendingTripDestination(null);
  }, [viewMode]);
  const selectedCommunityPost =
    communityPosts.find((post) => post.id === selectedCommunityPostId) ?? null;
  const [isGlobalActionOpen, setIsGlobalActionOpen] = useState(false);
  const [tripSetupMode, setTripSetupMode] = useState<"create" | "edit">(
    "create",
  );

  const [anonymousUserId] = useState<string>(() => {
    let id = localStorage.getItem("trippie_user_id");
    if (!id) {
      id = generateId();
      localStorage.setItem("trippie_user_id", id);
    }
    return id;
  });
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [authUser, setAuthUser] = useState<{
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  } | null>(null);
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [accountView, setAccountView] = useState<
    "account" | "auth" | "landing" | "creator"
  >("account");
  const [authEntryContext, setAuthEntryContext] = useState<
    "account" | "community"
  >("account");
  const [authReturnSection, setAuthReturnSection] =
    useState<AppSection>("community");
  const [ownershipMigrationDebug, setOwnershipMigrationDebug] =
    useState<OwnershipMigrationDebug | null>(null);
  const [ownershipSaveDebug, setOwnershipSaveDebug] =
    useState<OwnershipSaveDebug>({
      currentUserIdAtSave: "",
      savedByUserIdInput: "",
      savedObjectSavedByUserId: "",
      storageSavedByUserId: "",
    });
  const [savePipelineDebug, setSavePipelineDebug] = useState<SavePipelineDebug>(
    {
      authStatus: "loading",
      currentUserId: "",
      confirmClicked: false,
      selectedSliceCount: 0,
      selectedSliceIds: [],
      handlerEntered: false,
      saveObjectsCreated: 0,
      filteredOutCount: 0,
      dedupeMatchCount: 0,
      stateCountBefore: 0,
      stateCountInsideSetterPrev: 0,
      stateCountInsideSetterNext: 0,
      persistEffectTriggered: false,
      countPassedToPersistence: 0,
      storageParsedCountAfter: 0,
      error: "",
    },
  );
  const ownershipMigrationAttemptedRef = useRef<string | null>(null);
  const [returnToCommunityComposer, setReturnToCommunityComposer] =
    useState(false);
  const currentUserId = authUser?.id ?? anonymousUserId;
  const userId = currentUserId;

  const [friends, setFriends] = useState<Companion[]>(() => {
    const saved = localStorage.getItem("trippie_friends");
    return saved ? JSON.parse(saved) : [];
  });

  const [socket, setSocket] = useState<Socket | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const [currentPhase, setCurrentPhase] = useState<Phase>("pre");
  const [workspaceSection, setWorkspaceSection] =
    useState<WorkspaceSection>("overview");
  const [walletPhase, setWalletPhase] = useState<WalletPhase>("pre");
  const [postComments, setPostComments] = useState<PostComment[]>(() => loadPostComments());
  const [customCategories, setCustomCategories] = useState<CustomCategories>(
    () => loadCustomCategories(),
  );
  const [expenseFormPhase, setExpenseFormPhase] = useState<Phase | undefined>(
    undefined,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCompanionsOpen, setIsCompanionsOpen] = useState(false);
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [isTravelIdentityOpen, setIsTravelIdentityOpen] = useState(false);
  const [isVisaModalOpen, setIsVisaModalOpen] = useState(false);
  const [isTravelBookOpen, setIsTravelBookOpen] = useState(false);

  // Community & Social State
  const [publicTrips, setPublicTrips] = useState<PublicTrip[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem("trippie_profile");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UserProfile;
        const passports = Array.isArray(parsed.passports)
          ? parsed.passports.filter(
              (passport) =>
                passport &&
                typeof passport.id === "string" &&
                typeof passport.country === "string",
            )
          : [];
        return {
          ...parsed,
          passports,
          defaultPassportId: passports.some(
            (passport) => passport.id === parsed.defaultPassportId,
          )
            ? parsed.defaultPassportId
            : undefined,
        };
      } catch {
        /* use a clean profile below */
      }
    }
    return {
      id: "me",
      name: "旅人",
      points: 1200,
      trippieCoins: 50,
      level: 3,
      passports: [],
    };
  });
  const profilePassports = userProfile.passports || [];
  const [travelBook, setTravelBook] = useState<TravelBook | null>(null);
  // What the traveller pressed 需要真人協助 on, carried from the trip into the
  // service tab so they never retype the thing they already wrote down.
  const [helpRequest, setHelpRequest] = useState<HelpRequest | null>(null);
  /** Help requests this account has published. v1 shows nobody else's. */
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [marketplaceServices, setMarketplaceServices] = useState<
    MarketplaceService[]
  >([
    {
      id: "s1",
      providerName: "Yuki",
      serviceType: "BOOKING",
      title: "代訂日本米其林餐廳",
      description: "協助預訂東京、大阪熱門餐廳，保證成功率 90% 以上。",
      price: 500,
      currency: "TWD",
      rating: 4.9,
    },
    {
      id: "s2",
      providerName: "Marco",
      serviceType: "GUIDE",
      title: "羅馬私房景點導覽",
      description: "帶你走進觀光客不知道的小巷弄，體驗最道地的義大利生活。",
      price: 1200,
      currency: "TWD",
      rating: 4.8,
    },
  ]);

  const [inboxMessages, setInboxMessages] = useState<InboxMessage[]>([
    {
      id: "msg1",
      serviceTitle: "代訂京都米其林餐廳",
      sender: "Alice",
      lastMessage: "請問下週三晚上還有空位嗎？",
      time: "10:30 AM",
      unread: true,
    },
    {
      id: "msg2",
      serviceTitle: "東京地鐵一日導覽",
      sender: "Bob",
      lastMessage: "好的，那我們明天早上 9 點在新宿站見！",
      time: "昨天",
      unread: false,
    },
  ]);

  const unreadInboxCount = inboxMessages.filter((m) => m.unread).length;

  // Form Prefill State
  const [initialFormCategory, setInitialFormCategory] = useState<
    Category | undefined
  >(undefined);
  const [initialFormDescription, setInitialFormDescription] = useState<
    string | undefined
  >(undefined);
  const [initialFormAmount, setInitialFormAmount] = useState<
    number | undefined
  >(undefined);
  const [initialFormCurrency, setInitialFormCurrency] = useState<
    string | undefined
  >(undefined);
  const [formLinkedItemId, setFormLinkedItemId] = useState<string | undefined>(
    undefined,
  );
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(
    undefined,
  );
  // Expense awaiting delete confirmation. Holding the record itself (not just
  // an id) lets the modal render from canonical data without re-querying state.
  // Dev-only: view the ledger as another TripMember. Never set in production.
  const [devViewerOverride, setDevViewerOverride] = useState<string | null>(null);
  // Pending confirmation for consequential actions. Holding the callback keeps
  // each caller's own follow-up next to its own wording.
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  // Expense whose dispute thread is open. Stored by id so the modal always
  // renders the current record rather than a stale copy.
  const [disputeExpenseId, setDisputeExpenseId] = useState<string | null>(null);
  // The edit form is open as a proposal: the submitted values become a request
  // for the creator to approve, never a direct write.
  const [isProposalMode, setIsProposalMode] = useState(false);
  const [pendingExpenseDeletion, setPendingExpenseDeletion] = useState<{
    expense: Expense;
    adminCreatorName?: string;
  } | null>(null);

  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const [initialDraftStore] = useState(readDraftStore);
  const [drafts, setDrafts] = useState<TripDraft[]>(initialDraftStore.drafts);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(
    initialDraftStore.activeDraftId,
  );
  const [forceDraftEmptyState, setForceDraftEmptyState] = useState(false);
  const initialActiveDraft = initialDraftStore.drafts.find(
    (draft) => draft.id === initialDraftStore.activeDraftId,
  );
  const [itinerary, setItinerary] = useState<ItineraryItem[]>(
    () => initialActiveDraft?.itinerary || [],
  );
  const [itineraryFormItem, setItineraryFormItem] = useState<
    ItineraryItem | null | undefined
  >(undefined);
  const [itineraryFormDate, setItineraryFormDate] = useState<
    string | undefined
  >(undefined);
  const [flightAnchors, setFlightAnchors] = useState<FlightAnchor[]>(
    () => dedupeFlightAnchors(initialActiveDraft?.flightAnchors) || [],
  );
  const [flightMode, setFlightMode] = useState<TripFlightMode>(
    () => initialActiveDraft?.flightMode || "ROUND_TRIP",
  );
  const [savedInspirations, setSavedInspirations] = useState<
    SavedInspiration[]
  >(() => initialActiveDraft?.savedInspirations || []);
  const [selectedPassportId, setSelectedPassportId] = useState<
    string | undefined
  >(() => initialActiveDraft?.selectedPassportId);
  const isHydratingTripRef = useRef(false);
  const activeDraftIdRef = useRef<string | null>(
    initialDraftStore.activeDraftId,
  );

  // Country & Tax Rules
  const [travelCountry, setTravelCountry] = useState<string>(() => {
    return initialActiveDraft?.travelCountry || "";
  });

  const [tripDestination, setTripDestination] = useState<string>(() => {
    return initialActiveDraft?.destination || "";
  });
  const tripDestinationDraft = drafts.find(
    (draft) => draft.id === activeDraftId,
  );
  const tripDestinationCoordinates =
    tripDestinationDraft &&
    typeof tripDestinationDraft.destinationLatitude === "number" &&
    typeof tripDestinationDraft.destinationLongitude === "number"
      ? {
          latitude: tripDestinationDraft.destinationLatitude,
          longitude: tripDestinationDraft.destinationLongitude,
        }
      : undefined;

  // Saved inspirations picked for THIS trip's planning. Deliberately separate
  // from the SavedTravelInspiration store: selecting never writes back to it.
  const [selectedInspirationGroupIds, setSelectedInspirationGroupIds] = useState<
    string[]
  >([]);

  const [originCountry, setOriginCountry] = useState<string>(() => {
    return localStorage.getItem("trippie_origin_country") || "台灣";
  });

  const [taxRule, setTaxRule] = useState<TaxRule | null>(() => {
    return initialActiveDraft?.taxRule || null;
  });

  // Visa Info State (Persisted)
  const [visaInfo, setVisaInfo] = useState<VisaInfo | null>(() => {
    return initialActiveDraft?.visaInfo || null;
  });
  const [travelRules, setTravelRules] = useState<TravelRules | undefined>(
    () => initialActiveDraft?.travelRules,
  );
  const [isRefundSettlementOpen, setIsRefundSettlementOpen] = useState(false);
  const [refundSettlementEstimate, setRefundSettlementEstimate] = useState<
    number | undefined
  >();

  const [isFetchingTaxRule, setIsFetchingTaxRule] = useState(false);

  // Companions State
  const [companions, setCompanions] = useState<Companion[]>(() => {
    return initialActiveDraft?.companions || [];
  });

  // Shopping List State
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => {
    return initialActiveDraft?.shoppingList
      ? migrateShoppingList(initialActiveDraft.shoppingList)
      : [];
  });

  // Current Expenses (The Active Draft)
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    return initialActiveDraft?.expenses
      ? migrateExpenses(initialActiveDraft.expenses, initialActiveDraft.id)
      : [];
  });
  const [settlementBatches, setSettlementBatches] = useState<SettlementBatch[]>(
    () => initialActiveDraft?.settlementBatches || [],
  );
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [settlementNavDebug, setSettlementNavDebug] = useState({
    clickCount: 0,
    handlerEntered: false,
    stateBefore: "closed",
    lastNavigationError: "none",
  });

  // Trip Dates (Explicitly set by AI or User, separate from expense dates)
  const [tripStartDate, setTripStartDate] = useState<string>(() => {
    return initialActiveDraft?.startDate || "";
  });
  const [tripEndDate, setTripEndDate] = useState<string>(() => {
    return initialActiveDraft?.endDate || "";
  });
  const [tripCurrency, setTripCurrency] = useState<string>(
    () => initialActiveDraft?.currency || "TWD",
  );
  const [tripBudget, setTripBudget] = useState<number | undefined>(
    () => initialActiveDraft?.budget,
  );

  // Destination context handed to the saved-inspiration planner. Memoized so the
  // filtering/grouping pass only reruns when the destination actually changes.
  const tripInspirationContext = useMemo(
    () => ({
      destination: tripDestination,
      destinationCountry: tripDestinationDraft?.destinationCountry,
      destinationLatitude: tripDestinationCoordinates?.latitude,
      destinationLongitude: tripDestinationCoordinates?.longitude,
      destinationPlaceId: tripDestinationDraft?.destinationPlaceId,
      travelCountry,
      startDate: tripStartDate,
      endDate: tripEndDate,
    }),
    [
      tripDestination,
      tripDestinationDraft?.destinationCountry,
      tripDestinationCoordinates?.latitude,
      tripDestinationCoordinates?.longitude,
      tripDestinationDraft?.destinationPlaceId,
      travelCountry,
      tripStartDate,
      tripEndDate,
    ],
  );


  // Track which historical trip is currently loaded
  const [currentLoadedTripId, setCurrentLoadedTripId] = useState<string | null>(
    () => {
      return null;
    },
  );

  // A different trip means a different shortlist; never carry the old one over.
  useEffect(() => {
    setSelectedInspirationGroupIds([]);
  }, [activeDraftId, currentLoadedTripId, tripDestination]);

  // Draft Name State (For new trips before archiving)
  const [draftName, setDraftName] = useState<string>(() => {
    return initialActiveDraft?.name || "";
  });

  // Socket Connection & Sync
  useEffect(() => {
    const newSocket = io(window.location.origin);
    setSocket(newSocket);

    newSocket.on("trip-update", (payload: any) => {
      const tripId = payload?.tripId;
      const newState = payload?.state;
      if (!tripId || !newState) return;

      if (tripId !== activeDraftIdRef.current) {
        setDrafts((current) =>
          current.map((draft) =>
            draft.id === tripId
              ? {
                  ...draft,
                  expenses: newState.expenses || draft.expenses,
                  companions: newState.companions || draft.companions,
                  shoppingList: newState.shoppingList || draft.shoppingList,
                  startDate: newState.startDate ?? draft.startDate,
                  endDate: newState.endDate ?? draft.endDate,
                  name: newState.name ?? draft.name,
                  destination:
                    typeof newState.destination === "string"
                      ? newState.destination || undefined
                      : draft.destination,
                  updatedAt: new Date().toISOString(),
                }
              : draft,
          ),
        );
        return;
      }

      if (newState.expenses) setExpenses(newState.expenses);
      if (newState.companions) setCompanions(newState.companions);
      if (newState.shoppingList) setShoppingList(newState.shoppingList);
      if (newState.startDate) setTripStartDate(newState.startDate);
      if (newState.endDate) setTripEndDate(newState.endDate);
      if (newState.name) setDraftName(newState.name);
      if (typeof newState.destination === "string")
        setTripDestination(newState.destination);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  // Sync state to server when it changes and we are in a shared trip
  useEffect(() => {
    const syncTripId = activeDraftId || currentLoadedTripId;
    if (socket && syncTripId) {
      socket.emit("update-trip", {
        tripId: syncTripId,
        state: {
          expenses,
          companions,
          shoppingList,
          startDate: tripStartDate,
          endDate: tripEndDate,
          name: draftName,
          destination: tripDestination,
        },
      });
    }
  }, [
    expenses,
    companions,
    shoppingList,
    tripStartDate,
    tripEndDate,
    draftName,
    tripDestination,
    socket,
    activeDraftId,
    currentLoadedTripId,
  ]);

  useEffect(() => {
    const syncTripId = activeDraftId || currentLoadedTripId;
    if (socket && syncTripId) {
      socket.emit("join-trip", syncTripId);
    }
  }, [socket, activeDraftId, currentLoadedTripId]);

  const handleScanSuccess = (data: any) => {
    if (data.type === "SHARE_TRIP") {
      // 1. Add to friends if not already there
      const isFriend = friends.some((f) => f.id === data.userId);
      if (!isFriend) {
        const newFriend = { id: data.userId, name: data.userName };
        const updatedFriends = [...friends, newFriend];
        setFriends(updatedFriends);
        localStorage.setItem("trippie_friends", JSON.stringify(updatedFriends));
        showToast(`已將 ${data.userName} 加入好友`);
      }

      // 2. If tripId is present, join the trip
      if (data.tripId) {
        const now = new Date().toISOString();
        const sharedDraft: TripDraft = drafts.find(
          (draft) => draft.id === data.tripId,
        ) || {
          id: data.tripId,
          ownerId: userId,
          name: data.tripName || "共享旅程",
          startDate: "",
          endDate: "",
          expenses: [],
          companions: [],
          shoppingList: [],
          createdAt: now,
          updatedAt: now,
        };
        if (!drafts.some((draft) => draft.id === data.tripId)) {
          setDrafts((prev) => [...prev, sharedDraft]);
        }
        hydrateDraft(sharedDraft);
        setViewMode("trip");
        showToast(`已加入共享旅程：${data.tripName}`);

        // Add the owner as a companion if not already there
        const isCompanion = companions.some((c) => c.id === data.userId);
        if (!isCompanion) {
          setCompanions((prev) => [
            ...prev,
            { id: data.userId, name: data.userName },
          ]);
        }
      }

      setIsShareModalOpen(false);
    }
  };

  const handleOpenShareModal = () => {
    if (!activeDraftId && !currentLoadedTripId) {
      const newId = generateId();
      const now = new Date().toISOString();
      const sharedDraft: TripDraft = {
        id: newId,
        ownerId: userId,
        name: draftName || "新共享旅程",
        destination: tripDestination || undefined,
        startDate: tripStartDate,
        endDate: tripEndDate,
        expenses,
        companions,
        shoppingList,
        travelCountry: travelCountry || undefined,
        taxRule: taxRule || undefined,
        visaInfo: visaInfo || undefined,
        travelRules,
        createdAt: now,
        updatedAt: now,
      };
      setDrafts((prev) => [...prev, sharedDraft]);
      hydrateDraft(sharedDraft);
    }
    setIsShareModalOpen(true);
  };

  // Archived Trips
  const [tripHistory, setTripHistory] = useState<Trip[]>(() => {
    const saved = localStorage.getItem("trippie_history");
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return parsed.map((trip: any) => ({
      ...trip,
      expenses: migrateExpenses(
        Array.isArray(trip.expenses) ? trip.expenses : [],
        trip.id,
      ),
      companions: Array.isArray(trip.companions) ? trip.companions : [],
      shoppingList: Array.isArray(trip.shoppingList)
        ? migrateShoppingList(trip.shoppingList)
        : [],
      itinerary: Array.isArray(trip.itinerary) ? trip.itinerary : undefined,
      travelCountry:
        typeof trip.travelCountry === "string" ? trip.travelCountry : undefined,
      travelBook:
        trip.travelBook?.tripId === trip.id ? trip.travelBook : undefined,
      taxRule: trip.taxRule || undefined, // Ensure legacy data works
      visaInfo: trip.visaInfo || undefined, // New field support
    }));
  });

  // Determine initial view mode
  useEffect(() => {
    // Persist logic handled by localStorage hooks below
  }, []);

  useEffect(() => {
    let active = true;
    getSession()
      .then(async (session) => {
        if (!active) return;
        if (session?.user) {
          setAuthUser(session.user);
          setAuthStatus("authenticated");
          try {
            const profile = await fetchProfile(session.user.id);
            setAuthProfile(
              profile || {
                userId: session.user.id,
                displayName:
                  typeof session.user.user_metadata?.display_name === "string"
                    ? session.user.user_metadata.display_name
                    : "Trippie 旅人",
              },
            );
          } catch {
            setAuthProfile({
              userId: session.user.id,
              displayName:
                typeof session.user.user_metadata?.display_name === "string"
                  ? session.user.user_metadata.display_name
                  : "Trippie 旅人",
            });
          }
        } else setAuthStatus("anonymous");
      })
      .catch(() => {
        if (active) setAuthStatus("anonymous");
      });
    const subscription = subscribeToAuthChanges(async (_event, session) => {
      if (!active) return;
      if (session?.user) {
        setAuthUser(session.user);
        setAuthStatus("authenticated");
        try {
          const profile = await fetchProfile(session.user.id);
          setAuthProfile(
            profile || {
              userId: session.user.id,
              displayName:
                typeof session.user.user_metadata?.display_name === "string"
                  ? session.user.user_metadata.display_name
                  : "Trippie 旅人",
            },
          );
        } catch {
          setAuthProfile({
            userId: session.user.id,
            displayName:
              typeof session.user.user_metadata?.display_name === "string"
                ? session.user.user_metadata.display_name
                : "Trippie 旅人",
          });
        }
      } else {
        setAuthUser(null);
        setAuthProfile(null);
        setAuthStatus("anonymous");
      }
    });
    return () => {
      active = false;
      if ("data" in subscription) subscription.data.subscription.unsubscribe();
      else subscription.unsubscribe();
    };
  }, []);

  // Persistance
  useEffect(() => {
    localStorage.setItem("trippie_profile", JSON.stringify(userProfile));
  }, [userProfile]);
  useEffect(() => {
    localStorage.setItem("trippie_history", JSON.stringify(tripHistory));
  }, [tripHistory]);
  useEffect(() => {
    saveCommunityPosts(communityPosts);
  }, [communityPosts]);
  useEffect(() => {
    saveSavedTravelInspirations(savedTravelInspirations);
    setSavePipelineDebug((current) => ({
      ...current,
      persistEffectTriggered: true,
      countPassedToPersistence: savedTravelInspirations.length,
      storageParsedCountAfter: JSON.parse(
        localStorage.getItem("trippie_saved_travel_inspirations_v1") || "[]",
      ).length,
    }));
    if (ownershipSaveDebug.currentUserIdAtSave) {
      const persisted = JSON.parse(
        localStorage.getItem("trippie_saved_travel_inspirations_v1") || "[]",
      ) as SavedTravelInspiration[];
      const persistedOwner =
        persisted.find(
          (item) =>
            item.savedByUserId === ownershipSaveDebug.savedByUserIdInput,
        )?.savedByUserId || "";
      setOwnershipSaveDebug((current) => ({
        ...current,
        storageSavedByUserId: persistedOwner,
      }));
    }
  }, [savedTravelInspirations]);
  useEffect(() => {
    setSavePipelineDebug((current) => ({
      ...current,
      authStatus,
      currentUserId,
    }));
  }, [authStatus, currentUserId]);
  // Trips this account can see but this device has never held. Trip ids are
  // minted locally, so a second browser signed into the same account starts
  // with a completely different set and would otherwise never find the shared
  // ledger at all. Listed as empty shells; opening one pulls its expenses.
  const [cloudTripNote, setCloudTripNote] = useState<string>("");
  // Latest drafts for the merge below. Comparing inside a setDrafts updater
  // would mean deriving the banner text from inside a function React may run
  // twice or discard — the merge looked broken when only the report was.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    if (!authUser?.id || !isSyncAvailable()) {
      setCloudTripNote("");
      return;
    }
    let cancelled = false;
    void fetchMyTrips().then((result) => {
      if (cancelled) return;
      if (result.status !== "ok") {
        setCloudTripNote(
          result.status === "error"
            ? `雲端旅程讀取失敗：${result.message}`
            : "雲端旅程：未啟用",
        );
        return;
      }

      const known = new Set(draftsRef.current.map((draft) => draft.id));
      const missing = result.data
        .filter((trip) => !known.has(trip.id))
        .map((trip) => ({
          id: trip.id,
          name: trip.name,
          destination: trip.destination,
          startDate: trip.startDate,
          endDate: trip.endDate,
          currency: trip.currency,
          ownerId: authUser.id,
          expenses: [],
          companions: [],
          shoppingList: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

      // "The cloud has two trips" and "this device gained one" are different
      // facts, and only the second one means the merge worked.
      setCloudTripNote(
        `雲端旅程 ${result.data.length} 趟（本機新增 ${missing.length}，共 ${draftsRef.current.length + missing.length}）`,
      );
      if (missing.length) setDrafts((current) => [...current, ...missing]);
    });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  // Community posts this account can see: published posts by anyone, plus its
  // own drafts. Remote wins for any post that exists in both, and posts that
  // only exist here (written before signing in) are left alone.
  useEffect(() => {
    if (!authUser?.id || !isSyncAvailable()) return;
    let cancelled = false;
    void fetchCommunityPosts().then((result) => {
      if (cancelled || result.status !== "ok") return;
      setCommunityPosts((current) => {
        const remoteIds = new Set(result.data.map((post) => post.id));
        const localOnly = current.filter((post) => !remoteIds.has(post.id));
        // Anything of this account's own that never made it up goes now, so a
        // post written offline is not stranded on one device forever.
        localOnly
          .filter((post) => isPushablePost(post, authUser.id))
          .forEach((post) => void pushCommunityPost(post));
        return [...result.data, ...localOnly];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  // Comments for the post being read. Fetched per post rather than all at
  // once: a busy feed's comments are far larger than its posts, and nobody
  // needs the conversation under something they have not opened.
  useEffect(() => {
    if (!selectedCommunityPostId || !authUser?.id || !isSyncAvailable()) return;
    let cancelled = false;
    void fetchComments(selectedCommunityPostId).then((result) => {
      if (cancelled || result.status !== "ok") return;
      setPostComments((current) => {
        const others = current.filter((comment) => comment.postId !== selectedCommunityPostId);
        const next = [...others, ...result.data];
        savePostComments(next);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCommunityPostId, authUser?.id]);

  useEffect(() => {
    writeDraftStore(drafts, activeDraftId);
  }, [drafts, activeDraftId]);
  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !authUser?.id ||
      !anonymousUserId ||
      anonymousUserId === authUser.id
    ) {
      if (authStatus === "anonymous")
        ownershipMigrationAttemptedRef.current = null;
      return;
    }
    const migrationKey = `${anonymousUserId}:${authUser.id}`;
    if (ownershipMigrationAttemptedRef.current === migrationKey) return;
    ownershipMigrationAttemptedRef.current = migrationKey;
    try {
      const result = migrateLocalOwnership({
        anonymousUserId,
        authenticatedUserId: authUser.id,
        drafts,
        tripHistory,
        communityPosts,
        savedTravelInspirations,
        activeDraftId,
      });
      setDrafts(result.drafts);
      setTripHistory(result.tripHistory);
      setCommunityPosts(result.communityPosts);
      setSavedTravelInspirations(result.savedTravelInspirations);
      setOwnershipMigrationDebug(result.debug);
    } catch {
      ownershipMigrationAttemptedRef.current = null;
    }
  }, [authStatus, authUser?.id, anonymousUserId]);

  const handleAuthSuccess = () => {
    setAccountView("account");
    if (returnToCommunityComposer) {
      setReturnToCommunityComposer(false);
      setCommunityView("create");
      setAppSection("community");
      setViewMode("community");
    } else {
      setAppSection("profile");
    }
  };
  const handleAuthSignOut = async () => {
    try {
      await signOut();
      setAuthUser(null);
      setAuthProfile(null);
      setAuthStatus("anonymous");
      ownershipMigrationAttemptedRef.current = null;
    } catch {
      /* auth outage leaves local mode available */
    }
    setAccountView("landing");
    setAuthEntryContext("account");
    setAppSection("profile");
  };
  const handleProfileSave = async (values: {
    displayName: string;
    avatarUrl?: string;
    bio?: string;
  }) => {
    if (!authUser) return;
    const profile = await updateProfile(authUser.id, values);
    setAuthProfile(profile);
  };

  useEffect(() => {
    if (!activeDraftId) return;
    if (isHydratingTripRef.current) {
      isHydratingTripRef.current = false;
      return;
    }

    setDrafts((current) =>
      current.map((draft) =>
        draft.id === activeDraftId
          ? {
              ...draft,
              name: draftName,
              destination: tripDestination || undefined,
              startDate: tripStartDate,
              endDate: tripEndDate,
              expenses: [...expenses],
              companions: [...companions],
              shoppingList: [...shoppingList],
              itinerary: itinerary.length > 0 ? [...itinerary] : undefined,
              flightAnchors:
                flightAnchors.length > 0 ? [...flightAnchors] : undefined,
              flightMode,
              savedInspirations:
                savedInspirations.length > 0
                  ? [...savedInspirations]
                  : undefined,
              settlementBatches,
              selectedPassportId,
              travelCountry: travelCountry || undefined,
              taxRule: taxRule || undefined,
              visaInfo: visaInfo || undefined,
              travelRules,
              currency: tripCurrency || undefined,
              budget: tripBudget,
              updatedAt: new Date().toISOString(),
            }
          : draft,
      ),
    );
  }, [
    activeDraftId,
    companions,
    draftName,
    expenses,
    itinerary,
    shoppingList,
    taxRule,
    travelCountry,
    tripDestination,
    tripEndDate,
    tripStartDate,
    visaInfo,
    travelRules,
    flightAnchors,
    flightMode,
    savedInspirations,
    selectedPassportId,
    tripCurrency,
    tripBudget,
    settlementBatches,
  ]);

  // Load public trips (Mock for now, but ready for real API)
  useEffect(() => {
    const mockPublic: PublicTrip[] = tripHistory
      .filter((t) => t.expenses.length > 5)
      .map((t) => ({
        ...t,
        authorName: "匿名旅人",
        likes: Math.floor(Math.random() * 100),
        clones: Math.floor(Math.random() * 50),
        isPublic: true,
        tags: ["自助旅行", "美食之旅"],
        photos: [],
      }));
    setPublicTrips(mockPublic);
  }, [tripHistory]);

  // AI Itinerary Auto-generation
  useEffect(() => {
    if (viewMode === "trip" && expenses.length > 3 && itinerary.length === 0) {
      extractItineraryFromExpenses(expenses).then((items) => {
        setItinerary((current) => (current.length === 0 ? items : current));
      });
    }
  }, [expenses, viewMode, itinerary.length]);
  useEffect(() => {
    setItinerary((current) => {
      const derived = flightAnchors.flatMap((anchor) => {
        if (
          !anchor.departureDate ||
          !anchor.departureTime ||
          !anchor.departureAirport
        )
          return [];
        const [hours, minutes] = anchor.departureTime.split(":").map(Number);
        const total =
          hours * 60 + minutes - (anchor.airportArrivalBufferMinutes || 120);
        const arrivalTime = `${String(Math.floor(Math.max(0, total) / 60)).padStart(2, "0")}:${String(Math.max(0, total) % 60).padStart(2, "0")}`;
        return [
          {
            id: `flight-arrival-${anchor.id}`,
            time: arrivalTime,
            title: "抵達機場",
            location: anchor.departureAirport,
            notes: "依航班起飛時間與機場緩衝自動推算，可再編輯",
            type: "TRANSPORT" as const,
            date: anchor.departureDate,
            isCompleted: false,
            derivedFromFlightAnchorId: anchor.id,
          },
          {
            id: `flight-departure-${anchor.id}`,
            time: anchor.departureTime,
            title: "航班起飛",
            location: anchor.departureAirport,
            notes: "由已保存航班錨點產生",
            type: "FLIGHT" as const,
            date: anchor.departureDate,
            isCompleted: false,
            derivedFromFlightAnchorId: anchor.id,
          },
        ];
      });
      const kept = current.filter((item) => !item.derivedFromFlightAnchorId);
      const next = [...kept, ...derived];
      return next.length === current.length &&
        next.every((item, index) => item === current[index])
        ? current
        : next;
    });
  }, [flightAnchors]);
  useEffect(() => {
    localStorage.setItem("trippie_origin_country", originCountry);
  }, [originCountry]);

  // Toast Timer
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
  };

  const hydrateDraft = (draft: TripDraft) => {
    isHydratingTripRef.current = true;
    setForceDraftEmptyState(false);
    setCurrentLoadedTripId(null);
    setActiveDraftId(draft.id);
    setDraftName(draft.name);
    // A trip named 韓國釜山之旅 already says where it is going. Reading it on
    // open, not only while the name is being typed, is what makes an existing
    // trip fill itself in — otherwise every trip created before this existed
    // stays blank until someone retypes its name.
    // The destination field holds a country. An existing 釜山 is read back to
    // 韓國 rather than left as a city, because everything downstream — entry
    // rules, tax refunds, visas — asks a country-level question.
    const namedPlace =
      detectDestinationFromTripName(draft.destination || "") ||
      detectDestinationFromTripName(draft.name || "");
    setTripDestination(
      namedPlace ? destinationLabel(namedPlace) : draft.destination || "",
    );
    setTripStartDate(draft.startDate);
    setTripEndDate(draft.endDate);
    setTripCurrency(draft.currency || "TWD");
    setTripBudget(draft.budget);
    setExpenses(migrateExpenses(draft.expenses, draft.id));
    setCompanions(draft.companions || []);
    setShoppingList(migrateShoppingList(draft.shoppingList || []));
    setItinerary(draft.itinerary || []);
    setFlightAnchors(dedupeFlightAnchors(draft.flightAnchors) || []);
    setFlightMode(draft.flightMode || "ROUND_TRIP");
    setSavedInspirations(draft.savedInspirations || []);
    setSelectedPassportId(draft.selectedPassportId);
    setTravelBook(null);
    setIsTravelBookOpen(false);
    setTravelCountry(
      draft.travelCountry || draft.taxRule?.country || namedPlace?.country || "",
    );
    setTaxRule(draft.taxRule || null);
    setVisaInfo(draft.visaInfo || null);
    setTravelRules(draft.travelRules);
    setSettlementBatches(draft.settlementBatches || []);

    // The trip's own dates decide which part of it we are in. Only when a trip
    // has no dates do we fall back to guessing from what has been recorded.
    const byDate = phaseForDate(localToday(), draft.startDate, draft.endDate);
    if (byDate) {
      setCurrentPhase(byDate);
    } else {
      const hasPost = draft.expenses.some((expense) => expense.phase === "post");
      const hasDuring = draft.expenses.some(
        (expense) => expense.phase === "during",
      );
      setCurrentPhase(hasPost ? "post" : hasDuring ? "during" : "pre");
    }
  };

  // Helper to determine active trip name
  const currentTripName = activeDraftId
    ? draftName
    : currentLoadedTripId
      ? tripHistory.find((t) => t.id === currentLoadedTripId)?.name || ""
      : draftName;

  // --- Handlers ---
  /**
   * Fill the destination from the trip's name when it is still blank.
   *
   * Naming a trip 「韓國釜山之旅」 and then finding the entry-rules screen
   * saying 「尚未設定目的地」 is the app failing to read something the user
   * already told it. Only ever fills an empty field: a destination someone
   * chose outranks anything inferred from a title.
   */
  const applyDestinationFromName = (newName: string) => {
    if (tripDestination.trim() && travelCountry.trim()) return;
    const detected = detectDestinationFromTripName(newName);
    if (!detected) return;
    if (!tripDestination.trim()) setTripDestination(destinationLabel(detected));
    if (!travelCountry.trim()) setTravelCountry(detected.country);
  };

  const handleNameChange = (newName: string) => {
    applyDestinationFromName(newName);
    if (activeDraftId) {
      setDraftName(newName);
    } else if (currentLoadedTripId) {
      // Update historical trip name immediately
      setTripHistory((prev) =>
        prev.map((t) =>
          t.id === currentLoadedTripId ? { ...t, name: newName } : t,
        ),
      );
    } else {
      // Update draft name
      setDraftName(newName);
    }
  };

  // Logic for renaming from bookshelf
  const handleRenameFromBookshelf = (id: string | null, newName: string) => {
    if (id && drafts.some((draft) => draft.id === id)) {
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === id
            ? {
                ...draft,
                name: newName,
                updatedAt: new Date().toISOString(),
              }
            : draft,
        ),
      );
      if (activeDraftId === id) {
        applyDestinationFromName(newName);
        setDraftName(newName);
      }
    } else if (id === null && activeDraftId) {
      applyDestinationFromName(newName);
      setDraftName(newName);
    } else {
      // It's a historical trip
      setTripHistory((prev) =>
        prev.map((t) => (t.id === id ? { ...t, name: newName } : t)),
      );
    }
    showToast("已更新旅程名稱");
  };

  const handleSaveCountry = async (country: string) => {
    if (country === travelCountry && taxRule) {
      setIsCountryModalOpen(false);
      // If we have country but no Visa Info, trigger check
      if (!visaInfo) setIsVisaModalOpen(true);
      return;
    }
    setTravelCountry(country);
    setVisaInfo(null); // Reset visa info on country change
    setIsFetchingTaxRule(true);
    setTaxRule(null); // Clear old rule

    try {
      const rule = await fetchTaxRefundRules(country);
      if (rule) {
        setTaxRule(rule);
        showToast(
          `已更新：${rule.country} 退稅門檻 ${rule.minSpend} ${rule.currency}`,
        );
        setIsCountryModalOpen(false);
        // Trigger Visa Check
        setTimeout(() => setIsVisaModalOpen(true), 500);
      } else {
        showToast("查無此國家的退稅資訊，請確認名稱是否正確", "error");
      }
    } catch (e) {
      showToast("連線錯誤，請稍後再試", "error");
    } finally {
      setIsFetchingTaxRule(false);
    }
  };

  const handleSaveTravelIdentity = (
    passports: PassportProfile[],
    defaultId?: string,
    selectedId?: string,
  ) => {
    const safeDefaultId = passports.some(
      (passport) => passport.id === defaultId,
    )
      ? defaultId
      : undefined;
    const safeSelectedId = passports.some(
      (passport) => passport.id === selectedId,
    )
      ? selectedId
      : safeDefaultId;
    setUserProfile((profile) => ({
      ...profile,
      passports,
      defaultPassportId: safeDefaultId,
    }));
    setSelectedPassportId(safeSelectedId);
    showToast("已儲存旅行身分設定");
  };

  /* legacy tax guidance handler removed: Globe now uses researchTravelRules */
  const handleRequestTaxRefundGuidance = async (selectedId?: string) => {
    const passport = profilePassports.find((item) => item.id === selectedId);
    if (!tripDestination.trim()) throw new Error("尚未設定本次旅程目的地。");
    if (!passport?.countryCode) throw new Error("請先選擇具有國家代碼的護照。");
    const context = [
      `旅程目的地：${tripDestination.trim()}`,
      `使用護照國籍：${passport.country}（countryCode: ${passport.countryCode}）`,
      "明確需求：整理旅客購物退稅／VAT refund 的注意事項。",
      "居住地：未知；請勿假設護照國籍等於居住地。若資格需要居住地，請明確說明缺少此資訊。",
      "請提供實用的可能門檻、文件、流程與限制，並標示需要向官方機關或商店再次確認；不要宣稱最終退稅資格。",
    ].join("\n");
    try {
      const { suggestions } = await fetchPreparationSuggestions(context);
      const guidance = suggestions
        .map((item) => `${item.item}${item.reason ? `：${item.reason}` : ""}`)
        .join("\n");
      setTravelRules({
        ...(travelRules || {}),
        taxRefund: { guidance },
        destination: tripDestination.trim(),
        passportCountryCode: passport.countryCode,
        residenceStatus: "unknown",
        generatedAt: new Date().toISOString(),
        source: "AI_PREPARATION",
        disclaimer:
          "此為 AI 行前提醒，不代表最終退稅資格；資格仍取決於居住地與官方/當地規定。",
      });
      return suggestions;
    } catch (error) {
      if (
        error instanceof PreparationSuggestionRequestError &&
        error.status === 400
      )
        throw new Error("提供的旅行資訊太多，請稍後再試。");
      throw new Error("AI 旅程準備目前暫時無法使用，你仍可以手動建立待辦。");
    }
  };

  /**
   * The passport the entry-rules lookup should use.
   *
   * This trip's choice, else the profile default, else the only sensible
   * candidate on file. Requiring an explicit per-trip選擇 meant the overview
   * said 尚未選擇護照 to someone who had exactly one passport saved and had
   * already marked it 預設.
   */
  const resolvedPassport = (
    profilePassports.find(
      (passport) => passport.id === selectedPassportId && passport.countryCode,
    ) ||
    profilePassports.find(
      (passport) =>
        passport.id === userProfile.defaultPassportId && passport.countryCode,
    ) ||
    profilePassports.find((passport) => passport.countryCode)
  );
  const resolvedPassportId = resolvedPassport?.id;
  const resolvedPassportLabel = resolvedPassport
    ? `${resolvedPassport.country}護照`
    : undefined;

  /**
   * Typing a destination on the overview.
   *
   * The country follows from it when the table recognises the place, so the
   * entry-rules lookup has what it needs without a second field to fill.
   */
  /**
   * Choosing a passport from the overview.
   *
   * Picks the one already on file for that country, or creates it. Someone
   * selecting 台灣護照 has told us everything the lookup needs; making them
   * open a sheet to "add" it first would be asking the same question twice.
   */
  const handleSelectPassportCountry = (countryCode: string) => {
    if (!countryCode) return;
    const existing = profilePassports.find(
      (passport) => passport.countryCode === countryCode,
    );
    if (existing) {
      setSelectedPassportId(existing.id);
      return;
    }
    const option = PASSPORT_OPTIONS.find(
      (item) => item.countryCode === countryCode,
    );
    if (!option) return;
    const created = {
      id: `passport_${Date.now().toString(36)}`,
      country: option.displayName,
      countryCode: option.countryCode,
    };
    setUserProfile((profile) => ({
      ...profile,
      passports: [...(profile.passports || []), created],
      defaultPassportId: profile.defaultPassportId || created.id,
    }));
    setSelectedPassportId(created.id);
  };

  const handleDestinationFieldChange = (value: string) => {
    setTripDestination(value);
    const detected = detectDestinationFromTripName(value);
    if (detected) setTravelCountry(detected.country);
  };

  const handleResearchTravelRules = async (selectedId?: string) => {
    const passport = profilePassports.find((item) => item.id === selectedId);
    if (!tripDestination.trim()) throw new Error("尚未設定本次旅程目的地。");
    if (!passport?.countryCode) throw new Error("請先選擇具有國家代碼的護照。");
    const result = await researchTravelRules({
      tripId: activeDraftId || currentLoadedTripId || undefined,
      destination: tripDestination.trim(),
      passportCountryCode: passport.countryCode,
      startDate: tripStartDate,
      endDate: tripEndDate,
    });
    setTravelRules(result);
    if (result.entry?.actionableItems?.length) {
      setShoppingList((previous) => {
        const merged = mergeTravelRuleActionsIntoShoppingList(
          previous,
          result.entry?.actionableItems || [],
        );
        if (activeDraftId) {
          setDrafts((current) =>
            current.map((draft) =>
              draft.id === activeDraftId
                ? {
                    ...draft,
                    shoppingList: merged,
                    updatedAt: new Date().toISOString(),
                  }
                : draft,
            ),
          );
        }
        return merged;
      });
    }
    return result;
  };

  const handleSaveVisaInfo = (info: VisaInfo) => {
    setVisaInfo(info);
    setOriginCountry(info.origin); // Update user's origin preference
  };

  const handleAddVisaExpense = (info: VisaInfo) => {
    // Instead of adding an expense directly, we add it to the Shopping List (Pre-trip To-Do)
    const newItem: ShoppingItem = {
      id: generateId(),
      name: `${info.visaName || "簽證"}申請`,
      isPurchased: false,
      phase: "pre",
      estimatedAmount: info.feeAmount, // Save Estimated Cost
      estimatedCurrency: info.feeCurrency,
    };

    setShoppingList((prev) => [...prev, newItem]);
    showToast("已將簽證列入行前待辦清單");
  };

  const handleAddCompanion = (name: string) => {
    const newCompanion = { id: generateId(), name };
    setCompanions((prev) => [...prev, newCompanion]);
    showToast(`已新增旅伴：${name}`);
  };

  const handleAddFriendToTrip = (friend: Companion) => {
    setCompanions((prev) => [...prev, friend]);
    showToast(`已將好友 ${friend.name} 加入此旅程`);
  };

  const handleRemoveCompanion = (id: string) => {
    setCompanions((prev) => prev.filter((c) => c.id !== id));
    showToast("已移除旅伴", "error");
  };

  const handleAddShoppingItem = (name: string) => {
    const effectivePhase = currentPhase === "summary" ? "post" : currentPhase;
    setShoppingList((prev) => [
      ...prev,
      {
        id: generateId(),
        name,
        isPurchased: false,
        phase: effectivePhase,
      },
    ]);
    showToast("已新增購物清單項目");
  };

  const handleAddReturnShoppingItem = (name: string) => {
    setShoppingList((prev) => [
      ...prev,
      {
        id: generateId(),
        name,
        isPurchased: false,
        phase: "post",
      },
    ]);
    showToast("已新增返程待買項目");
  };

  const handleBatchAddShoppingItems = (
    items: string[],
    targetTripId: string | "new" | "draft",
    newTripName?: string,
    detectedCountry?: string,
  ) => {
    const normalizedItems = items
      .map((item) => ({
        title: item.trim(),
        description: undefined,
        timingText: undefined,
        source: undefined,
      }))
      .filter((item) => item.title);
    const uniqueItems = normalizedItems.filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.title.toLowerCase() === item.title.toLowerCase(),
        ) === index,
    );
    const existingNames =
      targetTripId === "draft"
        ? shoppingList
            .filter((item) => item.phase === "pre")
            .map((item) => item.name.trim().toLowerCase())
        : [];
    if (targetTripId === "draft") {
      setShoppingList((previous) => {
        const existingKeys = new Set(
          previous.map((item) => item.name.trim().toLowerCase()),
        );
        const newItems: ShoppingItem[] = uniqueItems
          .filter((item) => !existingKeys.has(item.title.toLowerCase()))
          .map((item) => ({
            id: generateId(),
            name: item.title,
            isPurchased: false,
            phase: "pre",
            description: item.description,
            timingText: item.timingText,
            source: item.source,
          }));
        const merged = [...previous, ...newItems];
        if (activeDraftId) {
          setDrafts((current) =>
            current.map((draft) =>
              draft.id === activeDraftId
                ? {
                    ...draft,
                    shoppingList: merged,
                    updatedAt: new Date().toISOString(),
                  }
                : draft,
            ),
          );
        }
        return merged;
      });
      showToast(`已加入 ${uniqueItems.length} 個待辦`);
      return;
    }
    const newItems: ShoppingItem[] = uniqueItems
      .filter((item) => !existingNames.includes(item.title.toLowerCase()))
      .map((item) => ({
        id: generateId(),
        name: item.title,
        isPurchased: false,
        phase: "pre",
        description: item.description,
        timingText: item.timingText,
        source: item.source,
      }));

    if (targetTripId === "new") {
      const now = new Date().toISOString();
      const newDraftId = generateId();
      const newDraft: TripDraft = {
        id: newDraftId,
        ownerId: userId,
        name: newTripName || "",
        destination: detectedCountry || undefined,
        startDate: "",
        endDate: "",
        expenses: [],
        companions: [],
        shoppingList: newItems,
        travelCountry: detectedCountry || undefined,
        createdAt: now,
        updatedAt: now,
      };
      setDrafts((prev) => [...prev, newDraft]);
      isHydratingTripRef.current = true;
      setActiveDraftId(newDraftId);
      setExpenses([]);
      setCompanions([]);
      setShoppingList(newItems);
      setCurrentLoadedTripId(null);
      setDraftName(newTripName || "");
      setTripStartDate("");
      setTripEndDate("");
      setCurrentPhase("pre");
      setTripDestination("");
      setTravelCountry("");
      setTaxRule(null);
      setVisaInfo(null);
      setTravelRules(undefined);

      // Auto-set Country if detected from AI
      if (detectedCountry) {
        setTripDestination(detectedCountry);
        setTravelCountry(detectedCountry);
        showToast(`已自動設定國家：${detectedCountry}`);

        // Fetch Tax Rule automatically
        fetchTaxRefundRules(detectedCountry).then((rule) => {
          if (rule) {
            setTaxRule(rule);
            showToast(`已自動套用 ${detectedCountry} 退稅規則`);
          }
        });
        // Trigger Visa Check
        setTimeout(() => setIsVisaModalOpen(true), 1200);
      } else {
        // The scan found no country. The trip's own name often still says
        // where it is going, and leaving the field blank here is what sent
        // people to the entry-rules screen to find nothing.
        const fromName = detectDestinationFromTripName(newTripName || "");
        if (fromName) {
          setTripDestination(destinationLabel(fromName));
          setTravelCountry(fromName.country);
        }
      }

      setViewMode("trip");
      showToast(`已建立新旅程並加入 ${newItems.length} 個待買項目`);
    } else if (drafts.some((draft) => draft.id === targetTripId)) {
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === targetTripId
            ? {
                ...draft,
                shoppingList: [...draft.shoppingList, ...newItems],
                updatedAt: new Date().toISOString(),
              }
            : draft,
        ),
      );
      if (activeDraftId === targetTripId) {
        setShoppingList((prev) => [...prev, ...newItems]);
      }
      showToast(`已加入 ${newItems.length} 個項目至指定草稿`);
    } else {
      // Add to historical trip
      setTripHistory((prev) =>
        prev.map((t) => {
          if (t.id === targetTripId) {
            return {
              ...t,
              shoppingList: [...(t.shoppingList || []), ...newItems],
            };
          }
          return t;
        }),
      );
      showToast(`已加入 ${newItems.length} 個項目至指定旅程`);
    }
  };

  const handleRemoveShoppingItem = (id: string) => {
    setShoppingList((prev) => prev.filter((item) => item.id !== id));
  };

  const handleTogglePreparationItem = (id: string) => {
    setShoppingList((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPurchased: !item.isPurchased } : item,
      ),
    );
  };

  const handleUpdateItineraryItem = (
    id: string,
    updates: Pick<ItineraryItem, "date" | "isCompleted">,
  ) => {
    setItinerary((current) => {
      const nextItinerary = current.map((item) =>
        item.id === id ? { ...item, ...updates } : item,
      );
      setDrafts((draftsCurrent) =>
        draftsCurrent.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                itinerary: [...nextItinerary],
                updatedAt: new Date().toISOString(),
              }
            : draft,
        ),
      );
      return nextItinerary;
    });
  };

  /**
   * Removes one itinerary item. Mirrors handleUpdateItineraryItem: the draft is
   * updated in the same pass, and the existing drafts effect persists it, so the
   * deletion survives a reload. Nothing outside this trip's itinerary is touched —
   * Saved Inspiration and the community post it came from are untouched, even when
   * the item still carries their provenance references.
   */
  const handleDeleteItineraryItem = (id: string) => {
    setItinerary((current) => {
      const nextItinerary = current.filter((item) => item.id !== id);
      if (nextItinerary.length === current.length) return current;
      setDrafts((draftsCurrent) =>
        draftsCurrent.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                itinerary: [...nextItinerary],
                updatedAt: new Date().toISOString(),
              }
            : draft,
        ),
      );
      return nextItinerary;
    });
  };

  const handleSaveItineraryItem = (item: ItineraryItem) => {
    setItinerary((current) => {
      const nextItem = itineraryFormItem
        ? current.find((existing) => existing.id === item.id)
          ? {
              ...item,
              id: item.id,
              isCompleted:
                current.find((existing) => existing.id === item.id)
                  ?.isCompleted === true,
            }
          : item
        : { ...item, id: generateId(), isCompleted: false };
      const nextItinerary = itineraryFormItem
        ? current.map((existing) =>
            existing.id === item.id ? { ...existing, ...nextItem } : existing,
          )
        : [...current, nextItem];
      setDrafts((draftsCurrent) =>
        draftsCurrent.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                itinerary: [...nextItinerary],
                updatedAt: new Date().toISOString(),
              }
            : draft,
        ),
      );
      return nextItinerary;
    });
    setItineraryFormItem(undefined);
  };

  const handleApplyItineraryProposal = (proposalItems: ItineraryItem[]) => {
    setItinerary((current) => {
      const existingKeys = new Set(
        current.map((item) =>
          `${item.date || ""}|${item.time}|${item.location || item.title}`.toLowerCase(),
        ),
      );
      const additions = proposalItems
        .filter(
          (item) =>
            !existingKeys.has(
              `${item.date || ""}|${item.time}|${item.location || item.title}`.toLowerCase(),
            ),
        )
        .map((item) => ({ ...item, id: generateId(), isCompleted: false }));
      const next = [...current, ...additions];
      setDrafts((draftsCurrent) =>
        draftsCurrent.map((draft) =>
          draft.id === activeDraftId
            ? { ...draft, itinerary: next, updatedAt: new Date().toISOString() }
            : draft,
        ),
      );
      return next;
    });
    showToast("已套用行程建議");
  };

  /**
   * Phase 3B: accept only into an empty official itinerary. The existing draft
   * store remains the single source of truth; Phase 3C owns non-empty merges.
   */
  const handleAcceptAiProposal = async (
    proposal: import("./services/itineraryPlanningService").TripInspirationProposal,
    mode: import("./services/itineraryAcceptance").ItineraryAcceptanceMode,
  ): Promise<ProposalAcceptanceResult> => {
    if (mode !== "append") return { ok: false, error: "目前只支援寫入空白正式行程。" };
    if (itinerary.length > 0) return { ok: false, error: "目前已有正式行程；為避免覆蓋既有內容，這份提案暫不寫入。" };
    if (!activeDraftId) return { ok: false, error: "找不到目前的旅程草稿，無法安全寫入。" };

    // Best effort, and deliberately before the write so one storage call still
    // persists everything. A lookup that fails or is rejected simply leaves that
    // item as text-only; it never blocks acceptance.
    const { proposal: enriched } = await enrichProposalPlaces(proposal, {
      destination: tripDestination,
      destinationCountry:
        tripDestinationDraft?.destinationCountry || travelCountry,
      destinationLatitude: tripDestinationCoordinates?.latitude,
      destinationLongitude: tripDestinationCoordinates?.longitude,
    }).catch(() => ({ proposal }));

    const accepted = buildAcceptedItineraryItems(enriched, generateId);
    const nextItinerary = [...accepted];
    const nextDrafts = drafts.map((draft) => draft.id === activeDraftId
      ? { ...draft, itinerary: nextItinerary, updatedAt: new Date().toISOString() }
      : draft);
    if (!nextDrafts.some((draft) => draft.id === activeDraftId)) {
      return { ok: false, error: "找不到目前的旅程草稿，無法安全寫入。" };
    }

    try {
      // Persist before changing the visible state so a storage failure leaves the
      // proposal available for retry and never reports a false success.
      writeDraftStore(nextDrafts, activeDraftId);
    } catch {
      return { ok: false, error: "行程儲存失敗，提案仍保留，請再試一次。" };
    }

    setItinerary(nextItinerary);
    setDrafts(nextDrafts);
    return { ok: true, addedCount: accepted.length, skippedDuplicateCount: 0 };
  };

  /**
   * Applies a confirmed AI adjustment to the official itinerary.
   *
   * Only ever called from 「套用這些調整」 — generating a diff never reaches here.
   * The write is the same canonical path acceptance uses: one persisted draft,
   * persisted before the visible state moves, so a storage failure reports a
   * failure rather than a half-applied plan.
   */
  const handleApplyItineraryAdjustment = async (
    proposal: ItineraryAdjustmentProposal,
  ): Promise<AdjustmentApplyResult> => {
    if (!activeDraftId) return { ok: false, error: "找不到目前的旅程草稿，無法安全寫入。" };
    if (proposal.changes.length === 0) return { ok: false, error: "這份調整沒有可套用的內容。" };

    // Newly suggested places go through the same best-effort Places resolution as
    // an accepted proposal. Existing items are never re-resolved: they already own
    // their identity. A failed lookup leaves the addition as text-only.
    const additions = proposal.changes.filter((change) => change.type === "add" && change.proposedItem);
    let enrichedProposal = proposal;
    if (additions.length > 0) {
      const { proposal: enriched } = await enrichProposalPlaces(
        { days: [{ date: tripStartDate || "", items: additions.map((change) => change.proposedItem!) }], warnings: [] },
        {
          destination: tripDestination,
          destinationCountry:
            tripDestinationDraft?.destinationCountry || travelCountry,
          destinationLatitude: tripDestinationCoordinates?.latitude,
          destinationLongitude: tripDestinationCoordinates?.longitude,
        },
      ).catch(() => ({
        proposal: null as import("./services/itineraryPlanningService").TripInspirationProposal | null,
      }));

      if (enriched) {
        const enrichedById = new Map(enriched.days.flatMap((day) => day.items).map((item) => [item.id, item]));
        enrichedProposal = {
          ...proposal,
          changes: proposal.changes.map((change) =>
            change.type === "add" && change.proposedItem
              ? { ...change, proposedItem: enrichedById.get(change.proposedItem.id) || change.proposedItem }
              : change,
          ),
        };
      }
    }

    const result = applyItineraryAdjustment(itinerary, enrichedProposal, generateId);
    const nextItinerary = result.items;
    const nextDrafts = drafts.map((draft) => draft.id === activeDraftId
      ? { ...draft, itinerary: nextItinerary, updatedAt: new Date().toISOString() }
      : draft);
    if (!nextDrafts.some((draft) => draft.id === activeDraftId)) {
      return { ok: false, error: "找不到目前的旅程草稿，無法安全寫入。" };
    }

    try {
      writeDraftStore(nextDrafts, activeDraftId);
    } catch {
      return { ok: false, error: "行程儲存失敗，你的行程沒有被更動，請再試一次。" };
    }

    setItinerary(nextItinerary);
    setDrafts(nextDrafts);
    return {
      ok: true,
      addedCount: result.addedCount,
      movedCount: result.movedCount,
      updatedCount: result.updatedCount,
      removedCount: result.removedCount,
      pinnedConflictCount: result.pinnedConflictCount,
    };
  };

  /**
   * Toggles the user's pin and persists it immediately through the canonical
   * draft path. Pinning only protects the item from AI adjustment; manual edit
   * and delete are unaffected.
   */
  const handleTogglePin = (itemId: string, nextPinned: boolean) => {
    const next = itinerary.map((item) =>
      item.id === itemId
        ? { ...item, isPinned: nextPinned ? true : undefined }
        : item,
    );
    commitItinerary(next);
  };

  /**
   * Commits a drag: a reorder within a day, or a move to another day.
   *
   * Writes through the same canonical draft path everything else uses — there is
   * no separate ordering store. The persist happens before the visible state
   * moves, and a storage failure leaves both the state and the disk exactly as
   * they were, so the card springs back rather than showing an order that was
   * never saved.
   */
  /** Persists an itinerary change through the canonical draft path. */
  const commitItinerary = (nextItinerary: ItineraryItem[]): boolean => {
    if (!activeDraftId) return false;
    const nextDrafts = drafts.map((draft) => draft.id === activeDraftId
      ? { ...draft, itinerary: nextItinerary, updatedAt: new Date().toISOString() }
      : draft);
    if (!nextDrafts.some((draft) => draft.id === activeDraftId)) return false;

    try {
      // Persist before the visible state moves, so a storage failure leaves both
      // the screen and the disk exactly as they were.
      writeDraftStore(nextDrafts, activeDraftId);
    } catch {
      return false;
    }

    setItinerary(nextItinerary);
    setDrafts(nextDrafts);
    return true;
  };

  /**
   * Commits a drag: a reorder within a day, or a move to another day.
   *
   * A drag changes card order only. It never edits a time — the itinerary is a
   * journey list, not a calendar, and inventing times mid-drag is exactly what
   * 「重新安排時間」 exists to do explicitly instead.
   */
  const handleReorderItinerary = (
    itemId: string,
    target: { toIndex: number } | { toDate: string; toIndex?: number },
  ): boolean => {
    if (!activeDraftId) return false;
    const result = "toDate" in target
      ? moveItemToDay(itinerary, itemId, target.toDate, target.toIndex)
      : reorderWithinDay(itinerary, itemId, target.toIndex);
    return result.changed ? commitItinerary(result.items) : false;
  };

  /**
   * A drag that changed an activity's start time. Later activities on the same
   * day move with it, keeping the gaps the user already had.
   */
  const handleRescheduleItem = (
    itemId: string,
    newStartMinutes: number,
  ): { ok: boolean; pushedLate?: boolean; startTime?: string } => {
    if (!activeDraftId) return { ok: false };
    const moved = itinerary.find((entry) => entry.id === itemId);
    const ordered = orderItemsForDay(itemsForDay(itinerary, moved?.date));
    const result = rescheduleFromItem(ordered, itemId, newStartMinutes, { isFixed: isFixedItem });
    if (!result.changed) return { ok: false };

    const byId = new Map(result.items.map((entry) => [entry.id, entry]));
    const next = itinerary.map((entry) => byId.get(entry.id) || entry);
    return commitItinerary(next)
      ? { ok: true, pushedLate: result.pushedLate, startTime: result.startTime }
      : { ok: false };
  };

  /**
   * Writes a fixed-event adjustment the user confirmed. A fixed event is never
   * moved by it — `applyFixedEventAdjustment` refuses that even if asked.
   */
  const handleApplyFixedAdjustment = (adjustment: FixedEventAdjustment): boolean => {
    if (!activeDraftId) return false;
    const result = applyFixedEventAdjustment(itinerary, adjustment);
    return result.changed ? commitItinerary(result.items) : false;
  };

  /**
   * 「重新安排時間」 — rewrites one day's times to follow the current card order,
   * using the same scheduler the AI planner uses. Only ever runs when the user
   * asks for it.
   */
  const handleResequenceDayTimes = (date?: string): boolean => {
    if (!activeDraftId) return false;
    const ordered = orderItemsForDay(itemsForDay(itinerary, date));
    const result = resequenceDayTimes(ordered);
    if (!result.changed) return false;

    const byId = new Map(result.items.map((entry) => [entry.id, entry]));
    return commitItinerary(itinerary.map((entry) => byId.get(entry.id) || entry));
  };

  const handlePurchaseShoppingItem = (item: ShoppingItem) => {
    // Default category based on phase logic (assuming item.phase matches context)
    let defaultCat = Category.SHOPPING;
    if (item.phase === "pre") defaultCat = Category.SHOPPING_PRE;
    if (item.name.includes("簽證")) defaultCat = Category.VISA; // Auto detect Visa
    if (item.phase === "post") defaultCat = Category.SOUVENIR;

    setInitialFormCategory(defaultCat);
    setInitialFormDescription(item.name);
    // Auto-fill amount/currency if available (e.g. from Visa info)
    if (item.estimatedAmount) setInitialFormAmount(item.estimatedAmount);
    if (item.estimatedCurrency) setInitialFormCurrency(item.estimatedCurrency);

    setFormLinkedItemId(item.id);
    // A shopping item carries its own stage; the expense belongs with it.
    setExpenseFormPhase(item.phase === "summary" ? "post" : item.phase);
    setIsFormOpen(true);
  };

  const handleSaveExpense = (
    data: Omit<Expense, "id">,
    linkedItemId?: string,
  ) => {
    if (editingExpense) {
      // Proposal mode never writes: the edited values are turned into a list of
      // changes for the creator to approve.
      if (isProposalMode) {
        // Everything the form can produce is offered; the service keeps only
        // the fields a proposal is allowed to carry.
        const proposal = buildExpenseProposal(editingExpense, {
          amount: data.amount,
          beneficiaries: data.beneficiaries,
          splitMethod: data.splitMethod,
          splitAllocations: data.splitAllocations,
        });
        if (!Object.keys(proposal.changes).length) {
          showToast("沒有可提議的變更，未送出建議。", "error");
          return;
        }
        handleRaiseDispute(editingExpense, "我想提出以下修正建議。", proposal);
        return;
      }
      if (
        !canEditExpense({
          expense: editingExpense,
          viewerMemberId,
          tripOwnerMemberId: activeOwnerMemberId,
        })
      ) {
        showToast("這筆支出由其他旅伴建立，無法修改。", "error");
        return;
      }
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === editingExpense.id
            ? // Editing never reassigns ownership: the original creator stays
              // the creator even though the form does not carry the field.
              { ...data, id: e.id, createdByMemberId: e.createdByMemberId }
            : e,
        ),
      );
    } else {
      const expense: Expense = {
        ...data,
        id: generateId(),
        // The viewer creating the record owns it. In single-user mode the
        // viewer is the trip owner, so this is the canonical owner member id
        // rather than the legacy "me" alias.
        createdByMemberId: data.createdByMemberId || viewerMemberId,
        linkedShoppingItemId: linkedItemId, // Link expense to shopping item
      };
      setExpenses((prev) => [...prev, expense]);

      if (linkedItemId) {
        setShoppingList((prev) =>
          prev.map((item) =>
            item.id === linkedItemId ? { ...item, isPurchased: true } : item,
          ),
        );
      }

      // Custom toast for auto-creation
      if (data.needsReview) {
        showToast("已建立支出，但部分內容可能需要確認", "error");
      } else if (!editingExpense) {
        // Standard create
        showToast("已新增支出");
      }
    }
  };

  const handleOpenRefundSettlement = (estimatedRefund?: number) => {
    setRefundSettlementEstimate(estimatedRefund);
    setIsRefundSettlementOpen(true);
  };
  const settlementTripId = activeDraftId || currentLoadedTripId || "active";
  // Canonical owner TripMember id for the active trip. Every expense this
  // app creates uses it, so no new legacy "me" identity is ever minted.
  // Named apart from the imported ownerMemberIdForTrip() migration helper:
  // an identically named local would shadow it for the whole component body.
  const activeOwnerMemberId = `${settlementTripId}:owner`;
  const settlementMembers = buildTripMembers(
    settlementTripId,
    userId,
    authProfile?.displayName || userProfile.name || "我",
    companions,
    friends,
  );
  // Who is actually looking at this trip. Previously hard-wired to the owner,
  // which made every ownership check trivially true. It now resolves against
  // the roster and only falls back to the owner when the account has no seat
  // here (signed out, anonymous, or not yet linked) — which is exactly the
  // current single-user situation, so behavior is unchanged until a real
  // second member exists.
  const viewerResolution = resolveViewer({
    roster: settlementMembers,
    authUserId: authUser?.id,
    tripOwnerMemberId: activeOwnerMemberId,
  });
  // Dev-only override so shared-trip permissions can be reviewed by hand
  // without a second account. It only changes who the UI believes is looking;
  // every permission check still runs against the selected member.
  const viewerMemberId =
    (import.meta.env.DEV && devViewerOverride) || viewerResolution.memberId;
  // Settlement is consumed per Expense x Member. An expense leaves the
  // outstanding set only when every non-owner participant is settled, so
  // settling Gina can no longer take V's share with it. Legacy unmarked
  // batches keep whole-expense semantics.
  const outstandingExpenses = filterOutstandingExpenses(
    expenses,
    settlementMembers,
    settlementBatches,
  );
  // Shared storage for the open trip. Off entirely when Supabase is not
  // configured or nobody is signed in, so the offline local ledger is unchanged.
  const tripSyncState = useTripSync({
    // The same trip id the rest of the screen uses. A trip opened from history
    // has no draft id, and keying sync on the draft alone left those trips
    // silently local.
    tripId: activeDraftId || currentLoadedTripId,
    authUserId: authUser?.id,
    tripName: draftName,
    destination: tripDestination || undefined,
    startDate: tripStartDate,
    endDate: tripEndDate,
    currency: tripCurrency || undefined,
    members: settlementMembers,
    expenses,
    note: cloudTripNote,
    onRemoteSnapshot: (snapshot) => {
      // The remote copy wins on open. Someone else may have added an expense
      // since this device last looked, and the local copy has no way to know.
      if (snapshot.expenses.length) {
        isHydratingTripRef.current = false;
        setExpenses(snapshot.expenses);
      }
      // The owner is derived locally from the account, not stored as a
      // companion, so only the others come back into the companion list.
      const remoteCompanions = snapshot.members
        .filter((member) => member.type !== "owner")
        .map((member) => ({ id: member.id, name: member.name }));
      if (remoteCompanions.length) setCompanions(remoteCompanions);
    },
  });

  useEffect(() => {
    // No UI for sync state yet — deliberately. It either works or the local
    // ledger carries on, and a badge that says "同步中" on every keystroke would
    // be noise. Visible in dev while the behaviour is being verified.
    if (!import.meta.env.DEV) return;
    console.info("[tripSync]", {
      state: tripSyncState,
      tripId: activeDraftId || currentLoadedTripId,
      // "off" has three quite different causes and they are indistinguishable
      // from the state alone, which is exactly when time gets wasted.
      supabaseConfigured,
      signedIn: Boolean(authUser?.id),
    });
  }, [activeDraftId, currentLoadedTripId, tripSyncState, authUser?.id]);

  const handleOpenSettlement = () => {
    setSettlementNavDebug((current) => ({
      ...current,
      clickCount: current.clickCount + 1,
      handlerEntered: true,
      stateBefore: isSettlementOpen ? "settlement" : "closed",
      lastNavigationError: "none",
    }));
    setIsSettlementOpen(true);
  };
  const handleSaveSettlementBatch = (batch: SettlementBatch) => {
    setSettlementBatches((current) => [
      ...current.filter((item) => item.id !== batch.id),
      batch,
    ]);
    showToast("已建立結算");
  };
  const handleUpdateSettlementBatch = (
    batchId: string,
    frozenResult?: FrozenSettlementResult,
  ) => {
    setSettlementBatches((current) =>
      current.map((batch) =>
        batch.id === batchId
          ? {
              ...batch,
              status: "settled",
              settledAt: new Date().toISOString(),
              // Freeze the agreed result so a later calculator change cannot
              // rewrite settled history. An existing frozen result is never
              // overwritten; a missing one is simply left missing.
              frozenResult: batch.frozenResult ?? frozenResult,
            }
          : batch,
      ),
    );
    showToast("已標記為已結算");
  };
  const handleDeleteSettlementBatch = (batchId: string) => {
    setSettlementBatches((current) =>
      current.filter((batch) => batch.id !== batchId),
    );
    showToast("已刪除結算");
  };

  const handleConfirmRefundSettlement = (
    amount: number,
    method: PaymentMethod,
  ) => {
    const currency =
      travelRules?.taxRefund?.numericRule?.currency ||
      taxRule?.currency ||
      tripCurrency;
    const duplicate = expenses.some(
      (expense) =>
        expense.description === "退稅入帳 (Tax Refund)" &&
        expense.phase === "post",
    );
    if (duplicate) {
      showToast("退稅已入帳，請勿重複建立。", "error");
      setIsRefundSettlementOpen(false);
      return;
    }
    const existingRate = expenses.find(
      (expense) =>
        expense.currency.toUpperCase() === currency.toUpperCase() &&
        Number.isFinite(expense.exchangeRate) &&
        expense.exchangeRate > 0,
    )?.exchangeRate;
    const rate =
      existingRate ||
      COMMON_CURRENCIES.find((item) => item.code === currency)?.defaultRate ||
      1;
    handleSaveExpense({
      date: new Date().toISOString().split("T")[0],
      description: "退稅入帳 (Tax Refund)",
      amount: -amount,
      currency,
      exchangeRate: rate,
      twdAmount: -(amount * rate),
      category: Category.OTHER,
      paymentMethod: method,
      phase: "post",
      payerId: activeOwnerMemberId,
      beneficiaries: [activeOwnerMemberId],
      splitMethod: "EQUAL",
      splitAllocations: {},
      handlingFee: 0,
    });
    setIsRefundSettlementOpen(false);
  };

  const handleDeleteExpense = (id: string) => {
    // Permission is enforced here, at the action boundary. Hiding the button is
    // presentation only; this handler stays reachable from stale renders and
    // future callers, so an unauthorized id must never reach the state update.
    const request = resolveExpenseDeleteRequest({
      expenses,
      expenseId: id,
      viewerMemberId,
      tripOwnerMemberId: activeOwnerMemberId,
    });

    if (request.status === "not-found") return;

    if (request.status === "denied") {
      showToast("這筆支出由其他旅伴建立，只有建立者可以刪除。", "error");
      return;
    }

    const { permission } = request;

    // Confirmation moved from window.confirm to an in-app modal. Nothing is
    // removed here; the pending record is parked and the actual deletion runs
    // unchanged in performDeleteExpense once the user presses 刪除.
    setPendingExpenseDeletion({
      expense: request.expense,
      adminCreatorName: permission.requiresAdminConfirmation
        ? memberNameById(settlementMembers, permission.creatorMemberId)
        : undefined,
    });
  };

  const performDeleteExpense = (id: string) => {
    const targetExpense = expenses.find((e) => e.id === id);

    // If this expense was linked to a shopping item, revert that item to unpurchased
    if (targetExpense && targetExpense.linkedShoppingItemId) {
      setShoppingList((prev) =>
        prev.map((item) =>
          item.id === targetExpense.linkedShoppingItemId
            ? { ...item, isPurchased: false }
            : item,
        ),
      );
    }

    setExpenses((prev) => prev.filter((e) => e.id !== id));
    showToast("已刪除該筆支出", "error");
  };

  // Disputes never change money. Each handler runs the pure rule first and only
  // writes back the expense the service returns, so an unauthorized call — from
  // a stale render or any future caller — cannot attach or close anything.
  const applyDisputeOutcome = (
    outcome: ReturnType<typeof raiseDispute>,
    successToast: string,
  ) => {
    if (outcome.status !== "ok") {
      showToast("無法完成這個動作，請重新整理後再試。", "error");
      return;
    }
    const updated = outcome.expense;
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setDisputeExpenseId(updated.id);
    showToast(successToast);
  };

  const disputeContextFor = (expense: Expense) => ({
    expense,
    viewerMemberId,
    tripOwnerMemberId: activeOwnerMemberId,
  });

  const handleRaiseDispute = (
    expense: Expense,
    message: string,
    proposal?: ExpenseProposal,
  ) => {
    applyDisputeOutcome(
      raiseDispute(disputeContextFor(expense), {
        message,
        id: generateId(),
        proposal,
      }),
      proposal ? "已送出修正建議" : "已提出疑問",
    );
  };

  // Approving writes the proposed number onto the expense and closes the
  // question in one step; the service refuses if the record moved on since.
  const handleApproveDisputeProposal = (
    expense: Expense,
    disputeId: string,
    response: string,
  ) => {
    applyDisputeOutcome(
      approveDisputeProposal(disputeContextFor(expense), { disputeId, response }),
      "已核准並更新金額",
    );
  };

  const handleResolveDispute = (
    expense: Expense,
    disputeId: string,
    response: string,
  ) => {
    applyDisputeOutcome(
      resolveDispute(disputeContextFor(expense), { disputeId, response }),
      "已標記為已回覆",
    );
  };

  const handleRevertDisputeProposal = (expense: Expense, disputeId: string) => {
    applyDisputeOutcome(
      revertDisputeProposal(disputeContextFor(expense), { disputeId }),
      "已撤銷這次修正",
    );
  };

  const handleWithdrawDispute = (expense: Expense, disputeId: string) => {
    applyDisputeOutcome(
      withdrawDispute(disputeContextFor(expense), { disputeId }),
      "已收回疑問",
    );
  };

  const handleConfirmExpenseDeletion = () => {
    const pending = pendingExpenseDeletion;
    // Close first, so a double press cannot fire the delete twice: the second
    // press finds no pending record and does nothing.
    setPendingExpenseDeletion(null);
    if (pending) performDeleteExpense(pending.expense.id);
  };

  const handleEditExpense = (expense: Expense) => {
    // A non-creator does not edit — they propose. Same form, different outcome,
    // so "this number is wrong" does not dead-end at a refusal toast.
    const mayEdit = canEditExpense({
      expense,
      viewerMemberId,
      tripOwnerMemberId: activeOwnerMemberId,
    });
    if (!mayEdit) {
      const mayPropose = canRaiseDispute({
        expense,
        viewerMemberId,
        tripOwnerMemberId: activeOwnerMemberId,
      }).allowed;
      if (!mayPropose) {
        showToast("這筆支出由其他旅伴建立，目前僅能檢視。", "error");
        return;
      }
      setIsProposalMode(true);
    } else {
      setIsProposalMode(false);
    }
    // Editing is a different context from settling: leaving the settlement
    // sheet open behind the form buries it and makes "back" ambiguous.
    setIsSettlementOpen(false);
    setExpenseFormPhase(expense.phase);
    setEditingExpense(expense);
    setIsFormOpen(true);
  };

  const handleArchiveTrip = (name: string, totalCost: number) => {
    try {
      // Use explicit trip dates if available, otherwise calculate from expenses
      let start = tripStartDate;
      let end = tripEndDate;

      if (!start || !end) {
        const range = getExpenseDateRange(expenses);
        start = range.start;
        end = range.end;
      }

      const archivedTripId =
        activeDraftId || currentLoadedTripId || generateId();
      const sourceDraft = drafts.find((draft) => draft.id === archivedTripId);
      const archivedAt = new Date().toISOString();
      const newTrip: Trip = {
        id: archivedTripId,
        ownerId: userId,
        name,
        destination: tripDestination || undefined,
        startDate: start,
        endDate: end,
        expenses: [...expenses],
        companions: [...companions],
        members: buildTripMembers(
          archivedTripId,
          userId,
          authProfile?.displayName || userProfile.name || "我",
          companions,
          friends,
        ),
        shoppingList: [...shoppingList],
        itinerary: itinerary.length > 0 ? [...itinerary] : undefined,
        travelCountry: travelCountry || undefined,
        travelBook:
          travelBook?.tripId === archivedTripId ? travelBook : undefined,
        createdAt: sourceDraft?.createdAt,
        updatedAt: archivedAt,
        totalCost,
        archivedAt,
        taxRule: taxRule || undefined,
        visaInfo: visaInfo || undefined,
        travelRules,
      };

      setTripHistory((prev) => [
        newTrip,
        ...prev.filter((trip) => trip.id !== archivedTripId),
      ]);
      setDrafts((prev) => prev.filter((draft) => draft.id !== archivedTripId));
      setExpenses([]);
      setCompanions([]);
      setShoppingList([]);
      setItinerary([]);
      setTravelBook(null);
      setIsTravelBookOpen(false);
      setCurrentLoadedTripId(null);
      setActiveDraftId(null);
      setDraftName(""); // Clear draft name
      setTripStartDate("");
      setTripEndDate("");
      setCurrentPhase("pre");
      setTripDestination("");
      setTravelCountry("");
      setTaxRule(null);
      setVisaInfo(null);
      setTravelRules(undefined);

      showToast("旅程已成功封存！");
      setViewMode("bookshelf"); // Go back to shelf
    } catch (e) {
      console.error(e);
      showToast("封存失敗，請稍後再試", "error");
    }
  };

  const handleOpenCompletedTrip = (trip: Trip) => {
    isHydratingTripRef.current = true;
    setForceDraftEmptyState(false);
    setActiveDraftId(null);
    setExpenses(migrateExpenses(trip.expenses || [], trip.id));
    setCompanions(trip.companions || []);
    setShoppingList(trip.shoppingList || []);
    setItinerary(Array.isArray(trip.itinerary) ? trip.itinerary : []);
    const persistedTravelBook =
      trip.travelBook?.tripId === trip.id ? trip.travelBook : null;
    setTravelBook(persistedTravelBook);
    setIsTravelBookOpen(Boolean(persistedTravelBook));
    setCurrentLoadedTripId(trip.id);
    setTripStartDate(trip.startDate);
    setTripEndDate(trip.endDate);
    setTripDestination(trip.destination || "");

    // Restore Tax Rule
    if (trip.taxRule) {
      setTaxRule(trip.taxRule);
      setTravelCountry(trip.travelCountry || trip.taxRule.country);
    } else {
      setTaxRule(null);
      setTravelCountry(trip.travelCountry || "");
    }

    // Restore Visa Info
    if (trip.visaInfo) {
      setVisaInfo(trip.visaInfo);
    } else {
      setVisaInfo(null);
    }

    setCurrentPhase("summary");
    setViewMode("trip");
    showToast(`已打開旅程回顧：${trip.name}`);
  };

  const handleOpenDraft = (draftId: string) => {
    const draft = drafts.find((candidate) => candidate.id === draftId);
    if (!draft) return;
    hydrateDraft(draft);
    setViewMode("trip");
    showToast(`已打開：${draft.name || "未命名旅程"}`);
  };

  const handleCreateNewTrip = () => {
    setPendingTripDestination(null);
    setTripSetupMode("create");
    setViewMode("tripSetup");
  };

  /**
   * Opens the existing Create Trip flow with a saved destination prefilled. It
   * persists nothing: the user still confirms dates and settings, and the trip is
   * created only by the normal handleSubmitTripSetup path.
   */
  const handleCreateTripFromSavedDestination = (
    country: string,
    city: string,
  ) => {
    setPendingTripDestination({ country, city });
    setTripSetupMode("create");
    // The saved-destination detail screen renders ahead of the setup screen, so it
    // has to step aside for the Create Trip flow to become reachable.
    setSelectedSavedDestination(null);
    setAppSection("trips");
    setViewMode("tripSetup");
  };

  const openCommunityComposer = () => {
    setIsGlobalActionOpen(false);
    if (authStatus !== "authenticated") {
      setReturnToCommunityComposer(true);
      setAuthEntryContext("community");
      setAccountView("landing");
      setAppSection("profile");
      return;
    }
    setCommunityView("create");
    setAppSection("community");
    setViewMode("community");
  };
  const openSourceCommunityPost = (postId?: string) => {
    if (!postId || !communityPosts.some((post) => post.id === postId)) {
      showToast("找不到原始貼文", "error");
      return;
    }
    setSelectedCommunityPostId(postId);
    setSelectedSavedDestination(null);
    setCommunityView("detail");
    setAppSection("community");
    setViewMode("community");
  };
  /**
   * Send a post up when it belongs to this account.
   *
   * Posts written before signing in carry the device id as their author; the
   * row's creator references a real account, so pushing those would fail on
   * every save. They stay local until the ownership migration re-homes them.
   */
  const syncPostUp = (post: CommunityPost) => {
    if (!isSyncAvailable() || !isPushablePost(post, authUser?.id)) return;
    void pushCommunityPost(post).then((result) => {
      if (result.status === "error" && import.meta.env.DEV) {
        console.warn("[communitySync] push failed", result.message);
      }
    });
  };

  const saveCommunityPost = (post: CommunityPost) => {
    setCommunityPosts((current) => [
      post,
      ...current.filter((item) => item.id !== post.id),
    ]);
    syncPostUp(post);
    setCommunityView("home");
    showToast("草稿已儲存");
  };
  const publishCommunityPost = (post: CommunityPost) => {
    setCommunityPosts((current) => [
      post,
      ...current.filter((item) => item.id !== post.id),
    ]);
    syncPostUp(post);
    setCommunityView("home");
    showToast("旅行貼文已發布");
  };
  const saveCommunitySlices = async (slices: PostSlice[]) => {
    setSavePipelineDebug((current) => ({
      ...current,
      confirmClicked: true,
      selectedSliceCount: slices.length,
      selectedSliceIds: slices.map((slice) => slice.id),
      handlerEntered: true,
      error: "",
    }));
    if (!selectedCommunityPostId) {
      setSavePipelineDebug((current) => ({
        ...current,
        error: "selectedCommunityPostId missing",
      }));
      return null;
    }
    // Resolve ownership at the moment of confirmation. This keeps anonymous saves
    // local after logout even if a handler was rendered before the auth transition.
    const persistedAnonymousUserId =
      localStorage.getItem("trippie_user_id") || anonymousUserId;
    const saveUserId = authUser?.id || persistedAnonymousUserId;
    const now = new Date().toISOString();
    const target = communityPosts.find(
      (post) => post.id === selectedCommunityPostId,
    );
    if (!target) {
      setSavePipelineDebug((current) => ({
        ...current,
        error: "target post missing",
      }));
      return null;
    }
    setSavePipelineDebug((current) => ({
      ...current,
      stateCountBefore: savedTravelInspirations.length,
    }));
    const resolvedSlices = await Promise.all(
      slices.map(async (slice) => {
        if (slice.placeId) return { slice, resolved: null };
        const resolved = await resolvePlace(
          `${slice.placeName || slice.title} ${slice.city} ${slice.country}`,
          slice.country,
        ).catch(() => null);
        return { slice, resolved };
      }),
    );
    const placePhotos = await Promise.all(
      resolvedSlices.map(async ({ slice, resolved }) => {
        const placeId = slice.placeId || resolved?.placeId;
        return placeId ? fetchPlacePhoto(placeId).catch(() => null) : null;
      }),
    );

    setSavedTravelInspirations((current) => {
      const next = [...current];
      let dedupeMatchCount = 0;
      resolvedSlices.forEach(({ slice, resolved }, index) => {
        const existingIndex = next.findIndex(
          (item) =>
            item.savedByUserId === saveUserId &&
            item.sourceSliceId === slice.id,
        );
        const savedNotes = slice.notes.map((note) => ({
          id: generateId(),
          sourceNoteId: note.id,
          sourceSliceId: slice.id,
          sourcePostId: target.id,
          sourceCreatorId: target.creatorId,
          type: note.type,
          text: note.text,
        }));
        const placeId = slice.placeId || resolved?.placeId;
        const placePhotoUrl = placePhotos[index]?.imageUrl;
        const placeMetadata = {
          placeId,
          resolvedPlaceName: resolved
            ? slice.placeName || slice.title
            : undefined,
          formattedAddress: resolved?.address,
          latitude: resolved?.latitude,
          longitude: resolved?.longitude,
          placePhotoUrl,
        };
        if (existingIndex >= 0) {
          dedupeMatchCount += 1;
          const existing = next[existingIndex];
          const notes = [...existing.notes];
          savedNotes.forEach((note) => {
            if (!notes.some((item) => item.sourceNoteId === note.sourceNoteId))
              notes.push(note);
          });
          next[existingIndex] = {
            ...existing,
            ...placeMetadata,
            notes,
            sourceNoteIds: Array.from(
              new Set(notes.map((note) => note.sourceNoteId)),
            ),
          };
        } else {
          next.push({
            id: generateId(),
            savedByUserId: saveUserId,
            country: slice.country,
            city: slice.city,
            placeName: slice.placeName || slice.title,
            ...placeMetadata,
            sourcePostId: target.id,
            sourceSliceId: slice.id,
            sourceCreatorId: target.creatorId,
            sourceNoteIds: Array.from(
              new Set(savedNotes.map((note) => note.sourceNoteId)),
            ),
            savedAt: now,
            notes: savedNotes,
          });
        }
      });
      const savedByUserIdInput = saveUserId;
      const savedObjectSavedByUserId =
        next.find(
          (item) =>
            item.savedByUserId === savedByUserIdInput &&
            item.sourcePostId === target.id,
        )?.savedByUserId || "";
      setOwnershipSaveDebug({
        currentUserIdAtSave: saveUserId,
        savedByUserIdInput,
        savedObjectSavedByUserId,
        storageSavedByUserId: savedObjectSavedByUserId,
      });
      setSavePipelineDebug((current) => ({
        ...current,
        saveObjectsCreated: resolvedSlices.length,
        filteredOutCount: 0,
        dedupeMatchCount,
        stateCountInsideSetterPrev: current.length,
        stateCountInsideSetterNext: next.length,
      }));
      return next;
    });
    showToast(`已收藏 ${slices.length} 個旅行靈感`);
    return {
      selectedPostId: selectedCommunityPostId,
      canonicalPostFound: true,
      saveInputSliceCount: slices.length,
      generatedCanonicalSliceIds: slices.map((slice) => slice.id).slice(0, 3),
      generatedCanonicalNoteCount: slices.reduce(
        (count, slice) => count + slice.notes.length,
        0,
      ),
      postIdPreserved: slices.every(
        (slice) =>
          slice.postId === target.id &&
          slice.notes.every((note) => note.postId === target.id),
      ),
      creatorIdPreserved: slices.every(
        (slice) =>
          slice.creatorId === target.creatorId &&
          slice.notes.every((note) => note.creatorId === target.creatorId),
      ),
      communityPostsUpdated: false,
      canonicalSlicesAfterSave: 0,
      savedByUserId: saveUserId,
    };
  };
  const resetCommunityPersonalSaves = (postId: string) => {
    setSavedTravelInspirations((current) =>
      current.filter(
        (item) =>
          !(item.savedByUserId === userId && item.sourcePostId === postId),
      ),
    );
    showToast("已重置這篇的個人收藏（DEV）");
  };
  const removeSavedTravelInspiration = (itemId: string) => {
    setSavedTravelInspirations((current) =>
      current.filter((item) => item.id !== itemId),
    );
    showToast("已移除這個旅行靈感");
  };
  const resolveSavedTravelInspiration = async (
    item: SavedTravelInspiration,
  ) => {
    if (item.placeId) return;
    const resolved = await resolvePlace(
      `${item.placeName} ${item.city} ${item.country}`,
      item.country,
    ).catch(() => null);
    if (!resolved?.placeId) return;
    const photo = await fetchPlacePhoto(resolved.placeId).catch(() => null);
    setSavedTravelInspirations((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              placeId: resolved.placeId,
              resolvedPlaceName: item.placeName,
              formattedAddress: resolved.address,
              latitude: resolved.latitude,
              longitude: resolved.longitude,
              placePhotoUrl: photo?.imageUrl,
            }
          : currentItem,
      ),
    );
  };

  const handleEditTrip = () => {
    setTripSetupMode("edit");
    setViewMode("tripSetup");
  };

  const handleSubmitTripSetup = async ({
    destination,
    startDate,
    endDate,
    currency,
    budget,
    companions: nextCompanions,
  }: TripSetupValues) => {
    // A trip started from a saved destination already knows its country, which
    // gives the place lookup the context it would otherwise have to guess.
    const countryContext =
      (tripSetupMode === "create" ? pendingTripDestination?.country : "") ||
      travelCountry;
    const resolved = await resolvePlace(destination, countryContext).catch(
      () => null,
    );
    const metadata = resolved
      ? {
          destinationCountry: resolved.country || countryContext || undefined,
          destinationAddress: resolved.address,
          destinationLatitude: resolved.latitude,
          destinationLongitude: resolved.longitude,
          destinationPlaceId: resolved.placeId,
        }
      : {};
    if (tripSetupMode === "create") {
      const now = new Date().toISOString();
      const newDraftId = generateId();
      const newDraft: TripDraft = {
        id: newDraftId,
        ownerId: userId,
        name: destination,
        destination: destination || undefined,
        selectedPassportId: userProfile.defaultPassportId,
        ...metadata,
        startDate,
        endDate,
        currency,
        budget,
        expenses: [],
        companions: nextCompanions,
        members: buildTripMembers(
          newDraftId,
          userId,
          authProfile?.displayName || userProfile.name || "我",
          nextCompanions,
          friends,
        ),
        shoppingList: [],
        createdAt: now,
        updatedAt: now,
      };
      setDrafts((prev) => [...prev, newDraft]);
      isHydratingTripRef.current = true;
      setActiveDraftId(newDraft.id);
      setExpenses([]);
      setShoppingList([]);
      setCurrentLoadedTripId(null);
      setDraftName(destination);
      setCurrentPhase("pre");
      // Keep the saved destination's country so the planner can match this trip's
      // saved inspirations even when the place lookup returned nothing.
      setTravelCountry(pendingTripDestination?.country || "");
      setPendingTripDestination(null);
      setSelectedPassportId(userProfile.defaultPassportId);
      setTaxRule(null);
      setVisaInfo(null);
      setTravelRules(undefined);
      setItinerary([]);
      showToast("新旅程已建立，開始準備吧！");
    } else if (activeDraftId) {
      setDrafts((prev) =>
        prev.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                name: destination,
                destination: destination || undefined,
                ...(resolved
                  ? metadata
                  : {
                      destinationCountry: draft.destinationCountry,
                      destinationAddress: draft.destinationAddress,
                      destinationLatitude: draft.destinationLatitude,
                      destinationLongitude: draft.destinationLongitude,
                      destinationPlaceId: draft.destinationPlaceId,
                    }),
                startDate,
                endDate,
                currency,
                budget,
                companions: nextCompanions,
                updatedAt: new Date().toISOString(),
              }
            : draft,
        ),
      );
      showToast("已更新旅程資訊");
    } else if (currentLoadedTripId) {
      setTripHistory((prev) =>
        prev.map((trip) =>
          trip.id === currentLoadedTripId
            ? {
                ...trip,
                destination: destination || undefined,
                startDate,
                endDate,
                currency,
                budget,
                companions: nextCompanions,
              }
            : trip,
        ),
      );
      showToast("已更新旅程資訊");
    } else {
      showToast("已更新旅程資訊");
    }

    setTripDestination(destination);
    setTripStartDate(startDate);
    setTripEndDate(endDate);
    setTripCurrency(currency);
    setTripBudget(budget);
    setCompanions(nextCompanions);
    setViewMode("trip");
  };

  const handleOpenAiPlannerFromSetup = () => {
    setViewMode("bookshelf");
    window.setTimeout(() => {
      document
        .getElementById("ai-trip-planner")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };

  const handleDeleteHistory = (id: string) => {
    const target = tripHistory.find((trip) => trip.id === id);
    setConfirmRequest({
      title: "刪除這本旅程紀錄？",
      description: `「${target?.name || "這趟旅程"}」的所有紀錄將被移除，此動作無法復原。`,
      confirmLabel: "刪除",
      tone: "danger",
      icon: "trash",
      onConfirm: () => {
        setTripHistory((prev) => prev.filter((t) => t.id !== id));
        showToast("已刪除旅程紀錄", "error");
      },
    });
  };

  /**
   * Deletes one trip by its stable id.
   *
   * The write happens BEFORE any visible state moves, and the previous store is
   * restored if it fails, so a storage error leaves the card, the active trip
   * and the workspace exactly as they were rather than half-cleared. The caller
   * owns the confirmation; this function assumes the user already said yes.
   *
   * Returns false when nothing was deleted, so the UI can surface an error.
   */
  const handleDeleteDraft = (id: string): boolean => {
    const plan = planTripDeletion(drafts, activeDraftId, id);
    if (!plan.target) return false;

    // Snapshot for rollback: writeDraftStore has already replaced both keys by
    // the time a later failure could surface, so we restore them ourselves.
    const previousDrafts = drafts;
    const previousActiveDraftId = activeDraftId;

    try {
      writeDraftStore(plan.remainingDrafts, plan.nextActiveDraftId);
    } catch {
      try {
        writeDraftStore(previousDrafts, previousActiveDraftId);
      } catch {
        // The restore failed too; state below is untouched either way.
      }
      showToast("旅程刪除失敗，這趟旅程沒有被移除，請再試一次。", "error");
      return false;
    }

    setDrafts(plan.remainingDrafts);

    if (plan.draftToHydrate) {
      hydrateDraft(plan.draftToHydrate);
    } else if (plan.clearWorkspace) {
      setForceDraftEmptyState(true);
      isHydratingTripRef.current = false;
      setActiveDraftId(null);
      setCurrentLoadedTripId(null);
      setDraftName("");
      setTripDestination("");
      setTripStartDate("");
      setTripEndDate("");
      setExpenses([]);
      setCompanions([]);
      setShoppingList([]);
      setItinerary([]);
      setCurrentPhase("pre");
      setTravelCountry("");
      setTaxRule(null);
      setVisaInfo(null);
      setTravelRules(undefined);
    }

    setViewMode("bookshelf");
    showToast("已刪除旅程", "error");
    return true;
  };

  const handleCloneTrip = (publicTrip: PublicTrip) => {
    setConfirmRequest({
      title: "複製這份行程規劃？",
      description: `會依照「${publicTrip.name}」建立一份新的草稿，原本的行程不受影響。`,
      confirmLabel: "複製",
      tone: "neutral",
      icon: "copy",
      onConfirm: () => performCloneTrip(publicTrip),
    });
  };

  const performCloneTrip = (publicTrip: PublicTrip) => {
    // Clone expenses but reset IDs and dates
    const today = new Date().toISOString().split("T")[0];
    const clonedExpenses: Expense[] = publicTrip.expenses.map((e) => ({
      ...e,
      id: generateId(),
      date: today,
      needsReview: true, // Mark for review since dates/rates might change
    }));

    const now = new Date().toISOString();
    const clonedDraft: TripDraft = {
      id: generateId(),
      ownerId: userId,
      name: `複製自: ${publicTrip.name}`,
      destination: publicTrip.destination,
      startDate: "",
      endDate: "",
      expenses: clonedExpenses,
      companions: [],
      shoppingList: publicTrip.shoppingList || [],
      travelCountry: publicTrip.taxRule?.country,
      taxRule: publicTrip.taxRule,
      visaInfo: publicTrip.visaInfo,
      createdAt: now,
      updatedAt: now,
    };
    setDrafts((prev) => [...prev, clonedDraft]);
    hydrateDraft(clonedDraft);
    setViewMode("trip");
    showToast("行程已複製！請檢查支出日期與匯率。");
  };

  const handleGenerateTravelBook = async () => {
    if (expenses.length < 3) {
      showToast("支出太少，無法產生回憶錄", "error");
      return;
    }

    showToast("AI 正在編寫您的旅程回憶錄...");
    const currentTrip: Trip = {
      id: activeDraftId || currentLoadedTripId || "draft",
      ownerId: userId,
      name: currentTripName,
      destination: tripDestination || undefined,
      startDate: tripStartDate,
      endDate: tripEndDate,
      expenses,
      companions,
      shoppingList,
      totalCost: expenses.reduce((sum, e) => sum + e.twdAmount, 0),
      archivedAt: new Date().toISOString(),
    };

    const book = await generateTravelBook(currentTrip);
    if (book) {
      setTravelBook(book);
      if (currentLoadedTripId && book.tripId === currentLoadedTripId) {
        setTripHistory((previous) =>
          previous.map((trip) =>
            trip.id === currentLoadedTripId
              ? { ...trip, travelBook: book }
              : trip,
          ),
        );
      }
      setIsTravelBookOpen(true);
      // Reward points for using AI
      setUserProfile((prev) => ({ ...prev, points: prev.points + 100 }));
    } else {
      showToast("產生失敗，請稍後再試", "error");
    }
  };

  // Pulled once signed in, so a request published on another device is here.
  useEffect(() => {
    if (!authUser?.id) {
      setServiceRequests([]);
      return;
    }
    fetchMyServiceRequests().then((result) => {
      if (result.status === "ok") setServiceRequests(result.data);
    });
  }, [authUser?.id]);

  /**
   * What this traveller actually spends per day, counted from their own past
   * trips. Given to the planner as context so a plan is sized to them, worded
   * as an observation rather than a budget they stated.
   */
  const budgetBrief = useMemo(() => {
    const days = (start?: string, end?: string) => {
      if (!start || !end) return 0;
      const from = new Date(`${start}T00:00:00`).getTime();
      const to = new Date(`${end}T00:00:00`).getTime();
      if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
      return Math.round((to - from) / 86400000) + 1;
    };
    return spendingProfileBrief(
      spendingProfile(
        drafts
          .filter((draft) => draft.id !== activeDraftId)
          .map((draft) => ({ expenses: draft.expenses || [], days: days(draft.startDate, draft.endDate) })),
      ),
    );
  }, [drafts, activeDraftId]);

  /**
   * What the traveller did with the plans they were shown.
   *
   * Recorded raw and fails soft: nobody choosing a ski plan should ever see an
   * error because an analytics write failed. No label is derived here — one
   * evening's choice is not who somebody is.
   */
  const recordPlanBehaviour = (
    type: PlanEventType,
    requestId: string,
    shown: ActivityPlanProposal[],
    option?: ActivityPlanProposal,
    itemIds: string[] = [],
  ) => {
    if (!authUser?.id || !requestId) return;
    recordPlanEvent(
      buildPlanEvent({
        type,
        userId: authUser.id,
        tripId: activeDraftId || currentLoadedTripId || "",
        requestId,
        option,
        shownOptions: shown,
        resultingItineraryItemIds: itemIds,
        generateId,
      }),
    );
  };

  const handlePublishServiceRequest = (
    draft: Omit<ServiceRequest, "id" | "tripId" | "requestedByUserId" | "createdAt" | "status">,
  ) => {
    if (!authUser?.id) {
      showToast("請先登入才能發佈協助需求", "error");
      return;
    }
    const request: ServiceRequest = {
      ...draft,
      id: generateId(),
      tripId: activeDraftId || currentLoadedTripId || "",
      requestedByUserId: authUser.id,
      status: "requested",
      createdAt: new Date().toISOString(),
    };
    // Shown immediately, pushed after: a network that is down must not lose the
    // request someone just wrote out. Publishing never touches the checklist —
    // the to-dos it names stay unticked until the traveller ticks them.
    setServiceRequests((prev) => [request, ...prev]);
    setViewMode("marketplace");
    publishServiceRequest(request).then((result) => {
      if (result.status === "error") {
        showToast("需求已建立，但尚未同步到雲端", "error");
      }
    });
  };

  const handleDeleteServiceRequest = (requestId: string) => {
    setServiceRequests((prev) => prev.filter((request) => request.id !== requestId));
    deleteServiceRequest(requestId);
  };

  const handleRequestHumanHelp = (request: HelpRequest) => {
    setHelpRequest(request);
    setViewMode("marketplace");
  };

  const handleBookService = (service: MarketplaceService) => {
    if (userProfile.trippieCoins < service.price) {
      showToast("Trippie Coins 不足，請先賺取積分", "error");
      return;
    }

    setConfirmRequest({
      title: "確認預約這項服務？",
      description: `預約「${service.title}」將扣除 ${service.price} Trippie Coins，扣除後不會自動退還。`,
      confirmLabel: `花費 ${service.price} 點`,
      tone: "neutral",
      icon: "coins",
      onConfirm: () => {
        setUserProfile((prev) => ({
          ...prev,
          trippieCoins: prev.trippieCoins - service.price,
        }));
        showToast("預約成功！當地人將在 24 小時內與您聯繫。");
      },
    });
  };

  const handleAddMarketplaceService = (
    service: Omit<MarketplaceService, "id" | "rating">,
  ) => {
    const newService: MarketplaceService = {
      ...service,
      id: generateId(),
      rating: 5.0,
    };
    setMarketplaceServices((prev) => [newService, ...prev]);
    showToast("服務已成功發佈！");
  };

  // Helper to get exchange rate synchronously
  const getRateForAutoSave = (
    currencyCode: string,
    paymentMethod: PaymentMethod,
    currentExpenses: Expense[],
  ) => {
    if (currencyCode === "TWD") return 1;

    if (paymentMethod === PaymentMethod.CASH_FOREIGN) {
      const exchanges = currentExpenses.filter(
        (e) => e.category === Category.EXCHANGE && e.currency === currencyCode,
      );
      if (exchanges.length > 0) {
        const totalForeign = exchanges.reduce(
          (acc, curr) => acc + curr.amount,
          0,
        );
        const totalCostTwd = exchanges.reduce(
          (acc, curr) => acc + curr.twdAmount,
          0,
        );
        if (totalForeign > 0) return totalCostTwd / totalForeign;
      }
    }

    const target = COMMON_CURRENCIES.find((c) => c.code === currencyCode);
    return target ? target.defaultRate : 1;
  };

  // Smart Scan Handler Logic - REFACTORED FOR BATCH PROCESSING
  const handleSmartScanBatch = async (files: FileList) => {
    // Helper to convert file to Base64
    const toBase64 = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

    // Temporary storage for results before updating state
    let newDraftExpenses: Expense[] = [];
    const historyUpdates: { id: string; expense: Expense }[] = [];
    let detectedCountry = "";
    let successCount = 0;

    // Helper to check if file belongs to a trip (by date)
    const findMatchingTripId = (date: string) => {
      return tripHistory.find((trip) => {
        if (trip.expenses.length === 0) return false;
        const start = trip.startDate;
        const end = trip.endDate;
        return date >= start && date <= end;
      })?.id;
    };

    // PROCESS FILES SEQUENTIALLY to avoid rate limits and logic race conditions
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64String = await toBase64(file);
        const base64Data = base64String.split(",")[1];

        // Call AI
        const result = await parseImageExpenseWithGemini(base64Data, file.type);

        if (result && result.amount) {
          const parsedAmount = result.amount;
          const parsedCurrency = result.currency?.toUpperCase() || "TWD";
          const parsedCategory =
            (Object.values(Category).find(
              (c) => c === result.category,
            ) as Category) || Category.OTHER;
          const parsedPayment =
            (Object.values(PaymentMethod).find(
              (p) => p === result.paymentMethod,
            ) as PaymentMethod) || PaymentMethod.CASH_TWD;
          const parsedDate =
            result.date || new Date().toISOString().split("T")[0];
          if (result.country && !detectedCountry)
            detectedCountry = result.country; // Capture first detected country

          let inferredPhase: Phase = "during";
          if (CATEGORIES_BY_PHASE.pre.includes(parsedCategory))
            inferredPhase = "pre";
          if (CATEGORIES_BY_PHASE.post.includes(parsedCategory))
            inferredPhase = "post";

          const newExpenseId = generateId();

          // Check History Match
          const matchedTripId = findMatchingTripId(parsedDate);

          if (matchedTripId) {
            // Get existing expenses for rate calc (need to find from history)
            const targetTrip = tripHistory.find((t) => t.id === matchedTripId);
            const existingExps = targetTrip ? targetTrip.expenses : [];
            const rate = getRateForAutoSave(
              parsedCurrency,
              parsedPayment,
              existingExps,
            );

            const newExpense: Expense = {
              id: newExpenseId,
              description: result.description || "智慧匯入項目",
              amount: parsedAmount,
              currency: parsedCurrency,
              exchangeRate: rate,
              twdAmount: parsedAmount * rate,
              category: parsedCategory,
              paymentMethod: parsedPayment,
              phase: inferredPhase,
              date: parsedDate,
              payerId: activeOwnerMemberId,
              beneficiaries: [activeOwnerMemberId],
              splitMethod: "EQUAL",
              splitAllocations: {},
              handlingFee: 0,
              needsReview: result.isUncertain,
            };
            historyUpdates.push({ id: matchedTripId, expense: newExpense });
          } else {
            // Default to Current Draft (which might be empty/new)
            // We need to calculate rate based on *current accumulated draft* + *existing draft*
            const combinedDraft = [...expenses, ...newDraftExpenses];
            const rate = getRateForAutoSave(
              parsedCurrency,
              parsedPayment,
              combinedDraft,
            );

            const newExpense: Expense = {
              id: newExpenseId,
              description: result.description || "智慧匯入項目",
              amount: parsedAmount,
              currency: parsedCurrency,
              exchangeRate: rate,
              twdAmount: parsedAmount * rate,
              category: parsedCategory,
              paymentMethod: parsedPayment,
              phase: inferredPhase,
              date: parsedDate,
              payerId: activeOwnerMemberId,
              // If current companions exist, include them, otherwise just me
              beneficiaries:
                companions.length > 0
                  ? [activeOwnerMemberId, ...companions.map((c) => c.id)]
                  : [activeOwnerMemberId],
              splitMethod: "EQUAL",
              splitAllocations: {},
              handlingFee: 0,
              needsReview: result.isUncertain,
            };
            newDraftExpenses.push(newExpense);

            // Update Trip Dates if AI found explicit Travel Range (only if draft was empty)
            if (
              result.travelStartDate &&
              result.travelEndDate &&
              expenses.length === 0 &&
              newDraftExpenses.length === 1
            ) {
              setTripStartDate(result.travelStartDate);
              setTripEndDate(result.travelEndDate);
            }
          }
          successCount++;
        }
      } catch (e) {
        console.error(`Error parsing file ${file.name}`, e);
        // Continue to next file even if one fails
      }
    }

    // --- BATCH STATE UPDATES ---

    // 1. Update History
    if (historyUpdates.length > 0) {
      setTripHistory((prev) =>
        prev.map((trip) => {
          const updatesForThisTrip = historyUpdates
            .filter((u) => u.id === trip.id)
            .map((u) => u.expense);
          if (updatesForThisTrip.length > 0) {
            return {
              ...trip,
              expenses: [...trip.expenses, ...updatesForThisTrip],
            };
          }
          return trip;
        }),
      );
    }

    // 2. Update Draft
    if (newDraftExpenses.length > 0) {
      if (!activeDraftId) {
        const now = new Date().toISOString();
        const importedDraft: TripDraft = {
          id: generateId(),
          ownerId: userId,
          name: `${new Date().toISOString().split("T")[0]} ${detectedCountry} 新旅程`.trim(),
          destination: detectedCountry || undefined,
          startDate: "",
          endDate: "",
          expenses: newDraftExpenses,
          companions: [],
          shoppingList: [],
          travelCountry: detectedCountry || undefined,
          createdAt: now,
          updatedAt: now,
        };
        setDrafts((prev) => [...prev, importedDraft]);
        hydrateDraft(importedDraft);
      }

      // If we detected a country and it hasn't been set for the current trip
      if (detectedCountry && !travelCountry) {
        if (!tripDestination) setTripDestination(detectedCountry);
        setTravelCountry(detectedCountry);
        showToast(`已自動偵測國家：${detectedCountry}`);

        fetchTaxRefundRules(detectedCountry).then((rule) => {
          if (rule) {
            setTaxRule(rule);
            showToast(`已自動套用 ${detectedCountry} 退稅規則`);
          }
        });

        // RESTORED: Trigger Visa Check
        setTimeout(() => setIsVisaModalOpen(true), 1200);
      }

      // Set default name if fresh
      if (expenses.length === 0 && !draftName) {
        const nameCountry = detectedCountry || "";
        setDraftName(
          `${new Date().toISOString().split("T")[0]} ${nameCountry} 新旅程`.trim(),
        );
      }

      // Determine phase based on last added item
      const lastPhase = newDraftExpenses[newDraftExpenses.length - 1].phase;
      setCurrentPhase(lastPhase);

      if (activeDraftId) {
        setExpenses((prev) => [...prev, ...newDraftExpenses]);
      }
    }

    // 3. Navigation & Feedback Logic
    if (successCount === 0) {
      showToast("所有圖片皆無法識別，請重試", "error");
      return;
    }

    // Scenario A: All went to ONE specific history trip
    const uniqueHistoryIds = Array.from(
      new Set(historyUpdates.map((u) => u.id)),
    );

    if (newDraftExpenses.length === 0 && uniqueHistoryIds.length === 1) {
      // Restore that trip and open it
      const tripId = uniqueHistoryIds[0];
      const targetTrip = tripHistory.find((t) => t.id === tripId);
      // We need the *updated* trip, but state update is async.
      // We can manually reconstruct the open state.
      if (targetTrip) {
        // Re-merge the new expenses we just calculated
        const addedExpenses = historyUpdates
          .filter((u) => u.id === tripId)
          .map((u) => u.expense);
        const mergedExpenses = [...targetTrip.expenses, ...addedExpenses];

        // Call restore logic manually
        setExpenses(mergedExpenses);
        setCompanions(targetTrip.companions || []);
        setShoppingList(
          targetTrip.shoppingList
            ? migrateShoppingList(targetTrip.shoppingList)
            : [],
        );
        setCurrentLoadedTripId(targetTrip.id);
        setTripStartDate(targetTrip.startDate);
        setTripEndDate(targetTrip.endDate);
        setTripDestination(
          targetTrip.destination || targetTrip.taxRule?.country || "",
        );
        if (targetTrip.taxRule) {
          setTaxRule(targetTrip.taxRule);
          setTravelCountry(targetTrip.taxRule.country);
        }
        if (targetTrip.visaInfo) setVisaInfo(targetTrip.visaInfo);

        setViewMode("trip");
        showToast(`成功匯入 ${successCount} 筆至「${targetTrip.name}」`);
        return;
      }
    }

    // Scenario B: All went to Draft (or Mixed, but we prioritize opening draft if it was empty)
    if (newDraftExpenses.length > 0 && uniqueHistoryIds.length === 0) {
      // Just open the draft
      setViewMode("trip");
      showToast(`成功匯入 ${successCount} 筆至當前草稿`);
      return;
    }

    // Scenario C: Mixed (Some to history, some to draft) OR Multiple Histories
    // Stay on bookshelf and show summary
    let msg = `已處理 ${successCount} 張單據：`;
    if (newDraftExpenses.length > 0)
      msg += `${newDraftExpenses.length}筆入草稿 `;
    if (historyUpdates.length > 0) msg += `${historyUpdates.length}筆歸檔歷史 `;

    showToast(msg);
    // Do not change viewMode, stay on bookshelf to let user choose
  };

  const handleExport = () => {
    const headers = [
      "日期",
      "階段",
      "分類",
      "付款方式",
      "項目",
      "原幣金額",
      "幣別",
      "匯率",
      "手續費(TWD)",
      "總台幣金額",
      "付款人",
      "分攤人/分帳詳情",
    ];
    const csvContent = [
      headers.join(","),
      ...expenses.map((e) => {
        const payerName = isOwnerIdentity(e.payerId)
          ? "我"
          : companions.find((c) => c.id === e.payerId)?.name || "未知";
        let beneficiaryInfo = "";

        if (e.splitMethod === "EQUAL") {
          beneficiaryInfo = e.beneficiaries
            .map((id) =>
              isOwnerIdentity(id)
                ? "我"
                : companions.find((c) => c.id === id)?.name || "",
            )
            .join(";");
        } else {
          beneficiaryInfo = Object.entries(e.splitAllocations)
            .map(([id, amount]) => {
              const name = isOwnerIdentity(id)
                ? "我"
                : companions.find((c) => c.id === id)?.name || "未知";
              return `${name}:$${Math.round(amount as number)}`;
            })
            .join(";");
        }

        return [
          e.date,
          e.phase === "pre"
            ? "旅行前"
            : e.phase === "during"
              ? "旅行中"
              : "回國機場消費",
          e.category,
          e.paymentMethod,
          `"${e.description}"`,
          e.amount,
          e.currency,
          e.exchangeRate,
          e.handlingFee || 0,
          e.twdAmount,
          payerName,
          `"${beneficiaryInfo}"`,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Trippie_Expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  /** Posts written by whoever is signed in here, newest first. */
  const myCommunityPosts = communityPosts
    .filter((post) => post.creatorId === currentUserId)
    .sort((a, b) =>
      (b.publishedAt || b.createdAt).localeCompare(a.publishedAt || a.createdAt),
    );

  /**
   * Public or not, using the state the feed already reads.
   *
   * The feed shows published posts only, so unpublishing is what 不公開 means;
   * nothing new has to be kept in step with it.
   */
  const handleTogglePostVisibility = (postId: string) => {
    let nowPublic = false;
    setCommunityPosts((current) =>
      current.map((post) => {
        if (post.id !== postId) return post;
        nowPublic = post.status !== "published";
        const next = {
          ...post,
          status: nowPublic ? "published" : "draft",
          publishedAt: nowPublic ? post.publishedAt || new Date().toISOString() : post.publishedAt,
          updatedAt: new Date().toISOString(),
        };
        syncPostUp(next);
        return next;
      }),
    );
    showToast(nowPublic ? "已公開這篇貼文" : "已改為不公開");
  };

  /**
   * Comments live in their own store, so writing one never rewrites the post:
   * two people typing at once would otherwise have one save a whole post
   * object over the other's.
   */
  const handleAddComment = (postId: string, content: string) => {
    const comment = buildComment({
      postId,
      authorId: currentUserId,
      authorName: authProfile?.displayName || userProfile.name || "旅人",
      authorAvatar: authProfile?.avatarUrl || userProfile.avatar,
      content,
    });
    if (!comment) return;
    setPostComments((current) => {
      const next = [...current, comment];
      savePostComments(next);
      return next;
    });
    if (isSyncAvailable() && authUser?.id) void pushComment(comment);
  };

  const handleDeleteComment = (comment: PostComment) => {
    setConfirmRequest({
      title: "刪除這則留言？",
      description: "刪除後無法復原。",
      confirmLabel: "刪除",
      tone: "danger",
      icon: "trash",
      onConfirm: () => {
        setPostComments((current) => {
          const next = current.filter((item) => item.id !== comment.id);
          savePostComments(next);
          return next;
        });
        if (isSyncAvailable() && authUser?.id) void deleteRemoteComment(comment.id);
      },
    });
  };

  const handleDeleteCommunityPost = (post: CommunityPost) => {
    setConfirmRequest({
      title: "刪除這篇貼文？",
      description: `「${post.title || "未命名貼文"}」將從你的貼文與社群中移除，此動作無法復原。`,
      confirmLabel: "刪除",
      tone: "danger",
      icon: "trash",
      onConfirm: () => {
        setCommunityPosts((current) => current.filter((item) => item.id !== post.id));
        if (isSyncAvailable() && isPushablePost(post, authUser?.id)) void deleteRemotePost(post.id);
        showToast("已刪除貼文", "error");
      },
    });
  };

  /**
   * Which stage a newly recorded expense belongs to.
   *
   * One rule in one place. Five call sites had their own copy, and the ones
   * behind the ＋ sheet read the overview's stage instead of the ledger's — so
   * adding an expense from 記帳 ＞ 旅行中 offered 機票、簽證、保險, the 行前
   * categories, because the trip has not departed yet.
   */
  const phaseForNewExpense = (): Phase => {
    const stage = workspaceSection === "records" ? walletPhase : currentPhase;
    return stage === "return" || stage === "summary" ? "post" : (stage as Phase);
  };

  const handleAddCustomCategory = (phase: Phase, name: string) => {
    setCustomCategories((current) => {
      const next = addCustomCategory(current, phase, name);
      if (next === current) {
        showToast("這個分類已經有了", "error");
        return current;
      }
      saveCustomCategories(next);
      return next;
    });
  };

  /**
   * Removing a category never touches expenses already recorded under it.
   * Deleting a label should not rewrite history, and the report still shows
   * what that money was spent on.
   */
  const handleRemoveCustomCategory = (phase: Phase, name: string) => {
    setCustomCategories((current) => {
      const next = removeCustomCategory(current, phase, name);
      saveCustomCategories(next);
      return next;
    });
  };

  const handleQuickAdd = (category: Category) => {
    setExpenseFormPhase(phaseForNewExpense());
    setInitialFormCategory(category);
    setIsFormOpen(true);
  };

  const handleWorkspacePhaseChange = (phase: Phase) => {
    setWorkspaceSection("overview");
    setCurrentPhase(phase);
  };

  const handleWorkspaceQuickAdd = (category?: Category) => {
    setExpenseFormPhase(phaseForNewExpense());
    if (category) setInitialFormCategory(category);
    setIsFormOpen(true);
  };

  // Delete requested from inside the edit modal: close the form first, then run
  // the ordinary delete request so the same permission check and confirmation
  // popup apply. There is no second delete path.
  const handleRequestDeleteFromForm = (expenseId: string) => {
    handleCloseForm();
    handleDeleteExpense(expenseId);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setIsProposalMode(false);
    setTimeout(() => {
      setInitialFormCategory(undefined);
      setInitialFormDescription(undefined);
      setInitialFormAmount(undefined);
      setInitialFormCurrency(undefined);
      setFormLinkedItemId(undefined);
      setEditingExpense(undefined);
      setExpenseFormPhase(undefined);
    }, 300);
  };

  const filteredExpenses = expenses.filter((e) => e.phase === currentPhase);

  // Dynamic Title for Shopping Panel
  let shoppingPanelTitle = "🛒 待買清單";
  if (currentPhase === "pre") shoppingPanelTitle = "🛍️ 行前購物清單";
  if (currentPhase === "post") shoppingPanelTitle = "🎁 免稅/機場待買清單";

  // --- RENDER ---

  if (selectedSavedDestination) {
    const destinationItems = savedTravelInspirations.filter(
      (item) =>
        item.country === selectedSavedDestination.country &&
        item.city === selectedSavedDestination.city,
    );
    return (
      <SavedTravelDestinationDetail
        country={selectedSavedDestination.country}
        city={selectedSavedDestination.city}
        items={destinationItems}
        communityPosts={communityPosts}
        onBack={() => setSelectedSavedDestination(null)}
        onRemove={removeSavedTravelInspiration}
        onResolveItem={resolveSavedTravelInspiration}
        onOpenCommunityPost={openSourceCommunityPost}
        onCreateTrip={handleCreateTripFromSavedDestination}
      />
    );
  }

  if (
    appSection === "community" ||
    appSection === "services" ||
    appSection === "profile"
  ) {
    if (appSection === "profile") {
      if (accountView === "landing")
        return (
          <div className="min-h-screen bg-[#f7f8fc]">
            <OwnershipDebugPanel
              authStatus={authStatus}
              authUserId={authUser?.id}
              anonymousUserId={anonymousUserId}
              currentUserId={currentUserId}
              saveDebug={ownershipSaveDebug}
              pipelineDebug={savePipelineDebug}
              migrationDebug={ownershipMigrationDebug}
            />
            <AuthLandingScreen
              onBack={() => {
                setAccountView("account");
                setAppSection(
                  authEntryContext === "community"
                    ? "community"
                    : authReturnSection,
                );
              }}
              onEmail={() => setAccountView("auth")}
              onUnavailableProvider={() => showToast("此登入方式尚未開放")}
            />
          </div>
        );
      if (accountView === "creator")
        return (
          <div className="min-h-screen bg-[#f7f8fc]">
            <CreatorCenterScreen
              posts={myCommunityPosts}
              comments={postComments}
              savedInspirations={savedTravelInspirations}
              onBack={() => setAccountView("account")}
              onOpenPost={openSourceCommunityPost}
              onCreatePost={openCommunityComposer}
            />
            <AppBottomNav
              active="profile"
              onChange={(section) => {
                setAccountView("account");
                setAppSection(section);
                if (section === "community") setViewMode("community");
                if (section === "trips") setViewMode("bookshelf");
              }}
              onPlus={() => setIsGlobalActionOpen(true)}
            />
          </div>
        );
      if (accountView === "auth")
        return (
          <div className="min-h-screen bg-[#f7f8fc]">
            <OwnershipDebugPanel
              authStatus={authStatus}
              authUserId={authUser?.id}
              anonymousUserId={anonymousUserId}
              currentUserId={currentUserId}
              saveDebug={ownershipSaveDebug}
              pipelineDebug={savePipelineDebug}
              migrationDebug={ownershipMigrationDebug}
            />
            <AuthScreen
              onBack={() => setAccountView("landing")}
              onSuccess={handleAuthSuccess}
              unavailable={!supabaseConfigured}
            />
          </div>
        );
      if (authStatus === "authenticated")
        return (
          <div className="min-h-screen bg-[#f7f8fc]">
            <OwnershipDebugPanel
              authStatus={authStatus}
              authUserId={authUser?.id}
              anonymousUserId={anonymousUserId}
              currentUserId={currentUserId}
              saveDebug={ownershipSaveDebug}
              pipelineDebug={savePipelineDebug}
              migrationDebug={ownershipMigrationDebug}
            />
            <AccountScreen
              authStatus={authStatus}
              profile={authProfile}
              email={authUser?.email}
              authAvailable={supabaseConfigured}
              onSignIn={() => {
                setAuthEntryContext("account");
                setAccountView("landing");
              }}
              onSignOut={handleAuthSignOut}
              onSaveProfile={handleProfileSave}
              myPosts={myCommunityPosts}
              savedInspirations={savedTravelInspirations}
              completedTripCount={tripHistory.length}
              onTogglePostVisibility={handleTogglePostVisibility}
              onDeletePost={handleDeleteCommunityPost}
              onCreatePost={openCommunityComposer}
              onOpenPost={openSourceCommunityPost}
              saverCounts={saverCountsByPost(savedTravelInspirations)}
              onOpenCreatorCenter={() => setAccountView("creator")}
            />
            <AppBottomNav
              active="profile"
              onChange={(section) => {
                setAppSection(section);
                if (section === "community") setViewMode("community");
                if (section === "trips") setViewMode("bookshelf");
              }}
              onPlus={() => setIsGlobalActionOpen(true)}
            />
          </div>
        );
      return (
        <div className="min-h-screen bg-[#f7f8fc]">
          <OwnershipDebugPanel
            authStatus={authStatus}
            authUserId={authUser?.id}
            anonymousUserId={anonymousUserId}
            currentUserId={currentUserId}
            saveDebug={ownershipSaveDebug}
            pipelineDebug={savePipelineDebug}
            migrationDebug={ownershipMigrationDebug}
          />
          <AuthLandingScreen
            onBack={() => {
              setAccountView("account");
              setAppSection(authReturnSection);
            }}
            onEmail={() => setAccountView("auth")}
            onUnavailableProvider={() => showToast("此登入方式尚未開放")}
          />
        </div>
      );
    }
    if (communityView === "create")
      return (
        <CreateCommunityPostScreen
          userId={userId}
          profile={{
            ...userProfile,
            id: currentUserId,
            name: authProfile?.displayName || userProfile.name,
            avatar: authProfile?.avatarUrl || userProfile.avatar,
          }}
          onBack={() => setCommunityView("home")}
          onSave={saveCommunityPost}
          onPublish={publishCommunityPost}
        />
      );
    if (communityView === "detail" && selectedCommunityPost)
      return (
        <CommunityPostDetail
          post={selectedCommunityPost}
          currentUserId={userId}
          savedTravelInspirations={savedTravelInspirations}
          onResetPersonalSaves={resetCommunityPersonalSaves}
          comments={commentsForPost(postComments, selectedCommunityPost.id)}
          onAddComment={(content) => handleAddComment(selectedCommunityPost.id, content)}
          onDeleteComment={handleDeleteComment}
          saverCount={countSaversForPost(savedTravelInspirations, selectedCommunityPost.id)}
          fallbackImage="https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=85"
          onSaveSlices={saveCommunitySlices}
          onBack={() => {
            setSelectedCommunityPostId(null);
            setCommunityView("home");
          }}
        />
      );
    return (
      <>
        <CommunityHome
          activeSection={appSection}
          posts={communityPosts}
          onOpenPost={(postId) => {
            if (!communityPosts.some((post) => post.id === postId)) return;
            setSelectedCommunityPostId(postId);
            setCommunityView("detail");
          }}
          onCreatePost={openCommunityComposer}
          onSectionChange={(section) => {
            if (section === "profile" && authStatus !== "authenticated") {
              setAuthEntryContext("account");
              setAuthReturnSection(appSection);
              setAccountView("landing");
              setAppSection("profile");
              return;
            }
            setAppSection(section);
            if (section === "trips") setViewMode("bookshelf");
          }}
          onPlus={() => setIsGlobalActionOpen(true)}
        />
        {isGlobalActionOpen && (
          <GlobalActionSheet
            context={appSection === "community" ? "community" : "travel"}
            onClose={() => setIsGlobalActionOpen(false)}
            onCreatePost={openCommunityComposer}
            onCreateTrip={() => {
              setIsGlobalActionOpen(false);
              setAppSection("trips");
              handleCreateNewTrip();
            }}
            onAddPlace={() => {
              setIsGlobalActionOpen(false);
              setAppSection("trips");
              setViewMode("bookshelf");
            }}
            onAddNote={() => {
              setIsGlobalActionOpen(false);
              setAppSection("trips");
              setViewMode("bookshelf");
            }}
            onAiImport={() => {
              setIsGlobalActionOpen(false);
              setAppSection("trips");
              setViewMode("tripSetup");
            }}
            onAddExpense={() => {
              setIsGlobalActionOpen(false);
              setAppSection("trips");
              setViewMode("trip");
              setExpenseFormPhase(phaseForNewExpense());
              setIsFormOpen(true);
            }}
          />
        )}
      </>
    );
  }

  if (viewMode === "tripSetup") {
    return (
      <CreateEditTripScreen
        mode={tripSetupMode}
        initialDestination={
          tripSetupMode === "create"
            ? pendingTripDestination?.city || ""
            : tripDestination
        }
        initialStartDate={tripSetupMode === "create" ? "" : tripStartDate}
        initialEndDate={tripSetupMode === "create" ? "" : tripEndDate}
        initialCurrency={tripSetupMode === "create" ? undefined : tripCurrency}
        initialBudget={tripSetupMode === "create" ? undefined : tripBudget}
        initialCompanions={tripSetupMode === "create" ? [] : companions}
        friends={friends}
        onBack={() =>
          setViewMode(tripSetupMode === "create" ? "bookshelf" : "trip")
        }
        onSubmit={handleSubmitTripSetup}
        onOpenAiPlanner={handleOpenAiPlannerFromSetup}
      />
    );
  }

  if (appSection === "trips" && viewMode === "bookshelf") {
    return (
      <TravelHome
        onDeleteDraft={handleDeleteDraft}
        activeSection="trips"
        authStatus={authStatus}
        authenticatedDisplayName={authProfile?.displayName}
        onSectionChange={(section) => {
          if (section === "profile" && authStatus !== "authenticated") {
            setAuthEntryContext("account");
            setAuthReturnSection("trips");
            setAccountView("landing");
            setAppSection("profile");
            return;
          }
          setAppSection(section);
          if (section === "community") setViewMode("community");
        }}
        onPlus={handleCreateNewTrip}
        drafts={drafts}
        tripHistory={tripHistory}
        activeDraftId={activeDraftId}
        savedTravelInspirations={savedTravelInspirations}
        communityPosts={communityPosts}
        onOpenSavedDestination={(country, city) =>
          setSelectedSavedDestination({ country, city })
        }
        onContinueDraft={handleOpenDraft}
        onContinueTrip={handleOpenCompletedTrip}
        onCreateNew={handleCreateNewTrip}
        onOpenPlanner={() => setViewMode("tripSetup")}
      />
    );
  }

  // 1. Bookshelf View
  if (viewMode === "bookshelf") {
    // Calculate display dates: Prefer explicit trip dates, fallback to expense range
    let displayStart = tripStartDate;
    let displayEnd = tripEndDate;

    if (!displayStart || !displayEnd) {
      const { start, end } = getExpenseDateRange(expenses);
      displayStart = start;
      displayEnd = end;
    }

    return (
      <div className="min-h-screen mx-auto bg-[#f7f9fd] flex flex-col relative w-full md:max-w-2xl transition-all duration-300 pb-24">
        <main className="flex-1 overflow-y-auto">
          <TripSelectionScreen
            currentDraftExpenses={expenses}
            draftName={draftName}
            draftStartDate={displayStart}
            draftEndDate={displayEnd}
            currentLoadedTripId={currentLoadedTripId}
            activeDraftId={activeDraftId}
            forceDraftEmptyState={forceDraftEmptyState}
            currentCountry={travelCountry}
            currentDestination={tripDestination}
            userName={userProfile.name}
            tripHistory={tripHistory}
            drafts={drafts}
            onOpenDraft={handleOpenDraft}
            onOpenTrip={handleOpenCompletedTrip}
            onCreateNew={handleCreateNewTrip}
            onDeleteDraft={handleDeleteDraft}
            onRenameTrip={handleRenameFromBookshelf}
            onSmartScan={handleSmartScanBatch}
            onBatchAddShoppingItems={handleBatchAddShoppingItems}
            onShare={handleOpenShareModal}
          />
        </main>

        <AppBottomNav
          active="trips"
          onChange={(section) => {
            if (section === "profile" && authStatus !== "authenticated") {
              setAuthEntryContext("account");
              setAuthReturnSection("trips");
              setAccountView("landing");
              setAppSection("profile");
              return;
            }
            setAppSection(section);
            if (section === "community") setViewMode("community");
          }}
          onPlus={() => setIsGlobalActionOpen(true)}
        />

        {isGlobalActionOpen && (
          <GlobalActionSheet
            context="travel"
            onClose={() => setIsGlobalActionOpen(false)}
            onCreatePost={openCommunityComposer}
            onCreateTrip={() => {
              setIsGlobalActionOpen(false);
              handleCreateNewTrip();
            }}
            onAddPlace={() => {
              setIsGlobalActionOpen(false);
              setViewMode("bookshelf");
            }}
            onAddNote={() => {
              setIsGlobalActionOpen(false);
              setViewMode("bookshelf");
            }}
            onAiImport={() => {
              setIsGlobalActionOpen(false);
              setViewMode("tripSetup");
            }}
            onAddExpense={() => {
              setIsGlobalActionOpen(false);
              setViewMode("trip");
              setExpenseFormPhase(phaseForNewExpense());
              setIsFormOpen(true);
            }}
          />
        )}

        {/* Toast Notification (Global) */}
        {toast && (
          <div
            className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-[60] flex items-center gap-2 text-sm font-bold animate-fade-in-down ${
              toast.type === "error"
                ? "bg-red-500 text-white"
                : "bg-gray-800 text-white"
            }`}
          >
            {toast.type === "error" ? (
              <Trash2 size={16} className="text-white" />
            ) : (
              <CheckCircle size={16} className="text-emerald-400" />
            )}
            {toast.msg}
          </div>
        )}

        <QRShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          userId={userId}
          userName={userProfile.name}
          currentTripId={activeDraftId || currentLoadedTripId}
          currentTripName={
            draftName || (currentLoadedTripId ? "歷史旅程" : undefined)
          }
          onScanSuccess={handleScanSuccess}
        />
      </div>
    );
  }

  // 1.1 Community View
  if (viewMode === "community") {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode("bookshelf")}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">旅人社群</h1>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <CommunityFeed
            trips={publicTrips}
            onClone={handleCloneTrip}
            onView={(t) => showToast(`查看 ${t.name}`)}
          />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button
            onClick={() => setViewMode("bookshelf")}
            className={`flex flex-col items-center gap-1 ${viewMode === "bookshelf" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button
            onClick={() => setViewMode("community")}
            className={`flex flex-col items-center gap-1 ${viewMode === "community" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex flex-col items-center gap-1 ${viewMode === "map" ? "text-brand-600" : "text-gray-400"}`}
          >
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button
            onClick={() => setViewMode("marketplace")}
            className={`flex flex-col items-center gap-1 relative ${viewMode === "marketplace" ? "text-brand-600" : "text-gray-400"}`}
          >
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("points")}
            className={`flex flex-col items-center gap-1 ${viewMode === "points" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 1.2 Marketplace View
  if (viewMode === "marketplace") {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode("bookshelf")}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">當地人服務</h1>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <Marketplace
            services={marketplaceServices}
            inboxMessages={inboxMessages}
            onBook={handleBookService}
            onAddService={handleAddMarketplaceService}
            helpRequest={helpRequest}
            onClearHelpRequest={() => setHelpRequest(null)}
            onPublishServiceRequest={handlePublishServiceRequest}
            destinationCountry={tripDestination}
            tripStartDate={tripStartDate}
            serviceRequests={serviceRequests}
            onDeleteServiceRequest={handleDeleteServiceRequest}
            onMarkMessageRead={(id) => {
              setInboxMessages((prev) =>
                prev.map((m) => (m.id === id ? { ...m, unread: false } : m)),
              );
            }}
          />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button
            onClick={() => setViewMode("bookshelf")}
            className={`flex flex-col items-center gap-1 ${viewMode === "bookshelf" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button
            onClick={() => setViewMode("community")}
            className={`flex flex-col items-center gap-1 ${viewMode === "community" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex flex-col items-center gap-1 ${viewMode === "map" ? "text-brand-600" : "text-gray-400"}`}
          >
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button
            onClick={() => setViewMode("marketplace")}
            className={`flex flex-col items-center gap-1 relative ${viewMode === "marketplace" ? "text-brand-600" : "text-gray-400"}`}
          >
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("points")}
            className={`flex flex-col items-center gap-1 ${viewMode === "points" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 1.3 Points View
  if (viewMode === "points") {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode("bookshelf")}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">我的積分</h1>
          </div>
        </header>
        <main className="flex-1 p-4 overflow-y-auto">
          <PointsDashboard profile={userProfile} />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button
            onClick={() => setViewMode("bookshelf")}
            className={`flex flex-col items-center gap-1 ${viewMode === "bookshelf" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button
            onClick={() => setViewMode("community")}
            className={`flex flex-col items-center gap-1 ${viewMode === "community" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex flex-col items-center gap-1 ${viewMode === "map" ? "text-brand-600" : "text-gray-400"}`}
          >
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button
            onClick={() => setViewMode("marketplace")}
            className={`flex flex-col items-center gap-1 relative ${viewMode === "marketplace" ? "text-brand-600" : "text-gray-400"}`}
          >
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("points")}
            className={`flex flex-col items-center gap-1 ${viewMode === "points" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 1.4 Map View
  if (viewMode === "map") {
    return (
      <div className="min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300 pb-24">
        <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setViewMode("bookshelf")}
              className="p-2 hover:bg-gray-100 rounded-full text-gray-500"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-xl font-black text-brand-900">地圖探索</h1>
          </div>
        </header>
        <main className="flex-1 overflow-hidden">
          <MapExplorer
            trips={publicTrips}
            onSelectTrip={(t) => showToast(`查看 ${t.name}`)}
          />
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full md:max-w-2xl bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-between items-center z-50">
          <button
            onClick={() => setViewMode("bookshelf")}
            className={`flex flex-col items-center gap-1 ${viewMode === "bookshelf" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Book size={20} />
            <span className="text-[10px] font-bold">書架</span>
          </button>
          <button
            onClick={() => setViewMode("community")}
            className={`flex flex-col items-center gap-1 ${viewMode === "community" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Users2 size={20} />
            <span className="text-[10px] font-bold">社群</span>
          </button>
          <button
            onClick={() => setViewMode("map")}
            className={`flex flex-col items-center gap-1 ${viewMode === "map" ? "text-brand-600" : "text-gray-400"}`}
          >
            <MapIcon size={20} />
            <span className="text-[10px] font-bold">地圖</span>
          </button>
          <button
            onClick={() => setViewMode("marketplace")}
            className={`flex flex-col items-center gap-1 relative ${viewMode === "marketplace" ? "text-brand-600" : "text-gray-400"}`}
          >
            <ShoppingBag size={20} />
            <span className="text-[10px] font-bold">服務</span>
            {unreadInboxCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border-2 border-white">
                {unreadInboxCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("points")}
            className={`flex flex-col items-center gap-1 ${viewMode === "points" ? "text-brand-600" : "text-gray-400"}`}
          >
            <Award size={20} />
            <span className="text-[10px] font-bold">積分</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Trip Detail View
  // Logic to show date in header
  let headerStart = tripStartDate;
  let headerEnd = tripEndDate;
  if (!headerStart || !headerEnd) {
    const { start, end } = getExpenseDateRange(expenses);
    headerStart = start;
    headerEnd = end;
  }
  const tripDateRangeDisplay = formatDateRange(headerStart, headerEnd);

  // Responsive Container Class
  // On Desktop: slightly wider (max-w-2xl) to allow side-by-side dashboard cards
  const containerClass =
    "min-h-screen mx-auto bg-gray-50 flex flex-col relative shadow-2xl border-x border-gray-100 w-full md:max-w-2xl lg:max-w-2xl transition-all duration-300";

  if (currentPhase === "pre" || currentPhase === "during") {
    const planningContent = (
      <div className="space-y-4 pb-4">
        <div className="px-1">
          <h2 className="text-xl font-black text-[#11183d]">
            {currentPhase === "pre" ? "旅程規劃" : "今日行程與筆記"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            詳細內容留在這裡，讓總覽保持輕量。
          </p>
        </div>
        <ItineraryCalendar
          items={itinerary}
          startDate={tripStartDate}
          endDate={tripEndDate}
          destination={tripDestination}
          destinationCountry={
            tripDestinationDraft?.destinationCountry || travelCountry
          }
          onReorder={handleReorderItinerary}
          onResequenceTimes={handleResequenceDayTimes}
          onRescheduleItem={handleRescheduleItem}
          onApplyFixedAdjustment={handleApplyFixedAdjustment}
          onTogglePin={handleTogglePin}
          onUpdateItem={handleUpdateItineraryItem}
          onAdd={(date) => {
            setItineraryFormDate(date);
            setItineraryFormItem(null);
          }}
          onEdit={(item) => {
            setItineraryFormDate(undefined);
            setItineraryFormItem(item);
          }}
          onDelete={handleDeleteItineraryItem}
        />
        {itineraryFormItem !== undefined && (
          <ItineraryItemForm
            item={itineraryFormItem || undefined}
            initialDate={itineraryFormDate}
            startDate={tripStartDate}
            endDate={tripEndDate}
            destinationLatitude={tripDestinationCoordinates?.latitude}
            destinationLongitude={tripDestinationCoordinates?.longitude}
            destinationCountry={tripDestinationDraft?.destinationCountry}
            travelCountry={travelCountry}
            onSave={handleSaveItineraryItem}
            onCancel={() => setItineraryFormItem(undefined)}
          />
        )}
        <FlightAnchorsForm
          anchors={flightAnchors}
          onChange={setFlightAnchors}
          destination={tripDestination}
          startDate={tripStartDate}
          endDate={tripEndDate}
          flightMode={flightMode}
          onFlightModeChange={setFlightMode}
        />
        <TripInspirationPlanner
          inspirations={savedTravelInspirations}
          communityPosts={communityPosts}
          trip={tripInspirationContext}
          selectedGroupIds={selectedInspirationGroupIds}
          onSelectionChange={setSelectedInspirationGroupIds}
          onExploreCommunity={() => {
            setAppSection("community");
            setViewMode("community");
          }}
          existingItinerary={itinerary}
          onAcceptProposal={handleAcceptAiProposal}
          onApplyAdjustment={handleApplyItineraryAdjustment}
          onProposalAccepted={() => setWorkspaceSection("overview")}
        />
        {/*
          Founder decision (Phase 1, Saved Inspiration -> Trip Planner):
          ItineraryPlanningAssistant is hidden on this planning screen so
          TripInspirationPlanner above is the only visible「AI 幫我排行程」entry.
          The component, the legacy SavedInspiration state, and handleApplyItineraryProposal
          are intentionally left in place untouched for a later ticket.
        */}
        {/*
          Founder UX decision: the 規劃 tab is planning only. PreTripChecklist is
          rendered entirely as expense shortcuts (every tile opens the expense
          form), so it belongs in the 記帳 flow and is not mounted here. The
          component and its other call site are untouched.

          The shopping list has now gone the same way. It shared its storage
          with the entry formalities, so this panel listed 簽證豁免 and
          Visit Japan Web beside 伴手禮 — and the overview already shows those
          as 入境規定 and 出發前待辦. The panel remains mounted in the 記帳
          flow, where buying something is the point.
        */}
      </div>
    );

    const walletExpensePhase: Phase | undefined =
      walletPhase === "pre"
        ? "pre"
        : walletPhase === "during"
          ? "during"
          : walletPhase === "return"
            ? "post"
            : undefined;
    const walletExpenses = walletExpensePhase
      ? expenses.filter((expense) => expense.phase === walletExpensePhase)
      : expenses;
    const recordsContent = (
      <div className="space-y-5 pb-4">
        <WalletPhaseSelector
          currentPhase={walletPhase}
          onChange={setWalletPhase}
        />
        {walletPhase === "pre" && (
          <WalletPreScreen
            currency={tripCurrency}
            budget={tripBudget}
            expenses={expenses}
            onEditBudget={handleEditTrip}
            onQuickAdd={() => handleQuickAdd(Category.OTHER)}
            onDeleteExpense={handleDeleteExpense}
            viewerMemberId={viewerMemberId}
            tripOwnerMemberId={activeOwnerMemberId}
            onOpenDisputes={(expense) => setDisputeExpenseId(expense.id)}
            onEditExpense={handleEditExpense}
            taxRule={taxRule}
          />
        )}
        {walletPhase === "return" && (
          <WalletReturnScreen
            expenses={expenses}
            shoppingList={shoppingList}
            taxRule={taxRule}
            travelRules={travelRules}
            onSettleRefund={() => handleOpenRefundSettlement()}
            onQuickAddCategory={handleQuickAdd}
            onAddShoppingItem={handleAddReturnShoppingItem}
            onRemoveShoppingItem={handleRemoveShoppingItem}
            onPurchaseShoppingItem={handlePurchaseShoppingItem}
            onDeleteExpense={handleDeleteExpense}
            viewerMemberId={viewerMemberId}
            tripOwnerMemberId={activeOwnerMemberId}
            onOpenDisputes={(expense) => setDisputeExpenseId(expense.id)}
            onEditExpense={handleEditExpense}
          />
        )}
        {walletPhase !== "pre" && walletPhase !== "return" && (
          <>
            <Dashboard
              batches={settlementBatches}
              // Spending totals read the raw ledger: settling a debt must never
              // erase the spending record. `batches` drives the debt block only.
              expenses={
                walletPhase === "summary"
                  ? selectSpendingExpenses(expenses)
                  : selectSpendingExpenses(walletExpenses)
              }
              companions={companions}
              members={buildTripMembers(
                activeDraftId || currentLoadedTripId || "active",
                userId,
                authProfile?.displayName || userProfile.name || "我",
                companions,
                friends,
              )}
              onExport={handleExport}
              onAddCash={() => handleQuickAdd(Category.EXCHANGE)}
              onAddExpense={handleSaveExpense}
              onSettleRefund={() => handleOpenRefundSettlement()}
              onOpenSettlement={handleOpenSettlement}
              viewerMemberId={viewerMemberId}
              // On 結算 the closing report below states the same total, card
              // liability and category split. Two cards with the same numbers
              // under different headings makes a reader check which to trust.
              settlementOnly={walletPhase === "summary"}
              currentPhase={walletExpensePhase || "summary"}
              taxRule={taxRule}
              travelRules={travelRules}
              visaInfo={visaInfo}
            />
            {/* No running list of individual expenses on 結算. That tab answers
                "what did this trip come to and who owes whom"; the itemised
                ledger is what the other tabs are for, and repeating it here
                buried the totals. */}
            {walletPhase !== "summary" && (
              <ExpenseList
                expenses={walletExpenses}
                onDelete={handleDeleteExpense}
                onEdit={handleEditExpense}
                taxRule={taxRule}
                viewerMemberId={viewerMemberId}
                tripOwnerMemberId={activeOwnerMemberId}
                onOpenDisputes={(expense) => setDisputeExpenseId(expense.id)}
              />
            )}
          </>
        )}
        {walletPhase === "summary" && (
          /* The trip's closing report belongs where the money is. It used to
             live only behind the overview's RECAP tab, so the ledger's own
             結算 tab stopped at the debts and never showed the trip's total. */
          <TripSummaryModal
            expenses={expenses}
            onArchive={handleArchiveTrip}
            taxRule={taxRule}
            variant="embedded"
            initialTripName={currentTripName}
            allowArchive={!currentLoadedTripId}
          />
        )}
        {import.meta.env.DEV && (
          <DevViewerSwitcher
            roster={settlementMembers}
            viewerMemberId={viewerMemberId}
            resolvedMemberId={viewerResolution.memberId}
            resolvedReason={viewerResolution.reason}
            overrideMemberId={devViewerOverride}
            onOverride={setDevViewerOverride}
          />
        )}
        <ExpenseDisputeModal
          expense={expenses.find((e) => e.id === disputeExpenseId) || null}
          roster={settlementMembers}
          viewerMemberId={viewerMemberId}
          tripOwnerMemberId={activeOwnerMemberId}
          onClose={() => setDisputeExpenseId(null)}
          onRaise={(message) => {
            const target = expenses.find((e) => e.id === disputeExpenseId);
            if (target) handleRaiseDispute(target, message);
          }}
          onResolve={(disputeId, response) => {
            const target = expenses.find((e) => e.id === disputeExpenseId);
            if (target) handleResolveDispute(target, disputeId, response);
          }}
          onApprove={(disputeId, response) => {
            const target = expenses.find((e) => e.id === disputeExpenseId);
            if (target) handleApproveDisputeProposal(target, disputeId, response);
          }}
          onRevert={(disputeId) => {
            const target = expenses.find((e) => e.id === disputeExpenseId);
            if (target) handleRevertDisputeProposal(target, disputeId);
          }}
          onWithdraw={(disputeId) => {
            const target = expenses.find((e) => e.id === disputeExpenseId);
            if (target) handleWithdrawDispute(target, disputeId);
          }}
          onOpenExpense={(expense) => {
            setDisputeExpenseId(null);
            handleEditExpense(expense);
          }}
        />
        <ConfirmDialog
          request={confirmRequest}
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => {
            const pending = confirmRequest;
            // Close first: a second press finds nothing pending,
            // so an action can never run twice.
            setConfirmRequest(null);
            pending?.onConfirm();
          }}
        />
        <DeleteExpenseConfirmModal
          expense={pendingExpenseDeletion?.expense || null}
          adminCreatorName={pendingExpenseDeletion?.adminCreatorName}
          onCancel={() => setPendingExpenseDeletion(null)}
          onConfirm={handleConfirmExpenseDeletion}
        />
      </div>
    );

    return (
      <>
        {debugPanelsEnabled() && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 font-mono text-[10px] text-slate-700">
            <div className="font-black">SETTLEMENT NAV DEBUG</div>
            <div>clickCount: {settlementNavDebug.clickCount}</div>
            <div>
              handlerEntered: {settlementNavDebug.handlerEntered ? "YES" : "NO"}
            </div>
            <div>tripId: {settlementTripId}</div>
            <div>
              activeTripId: {activeDraftId || currentLoadedTripId || "none"}
            </div>
            <div>currentTripView: {currentPhase}</div>
            <div>targetTripView: settlement</div>
            <div>
              settlementViewState: {isSettlementOpen ? "settlement" : "closed"}
            </div>
            <div>
              settlementComponentMounted: {isSettlementOpen ? "YES" : "NO"}
            </div>
            <div>
              lastNavigationError: {settlementNavDebug.lastNavigationError}
            </div>
          </div>
        )}
        <RefundSettlementModal
          isOpen={isRefundSettlementOpen}
          currency={
            travelRules?.taxRefund?.numericRule?.currency ||
            taxRule?.currency ||
            tripCurrency
          }
          estimatedRefund={refundSettlementEstimate}
          onClose={() => setIsRefundSettlementOpen(false)}
          onConfirm={handleConfirmRefundSettlement}
        />
        <TripWorkspaceShell
          tripName={currentTripName}
          dateRange={tripDateRangeDisplay}
          destination={tripDestination}
          currentPhase={currentPhase}
          currentSection={workspaceSection}
          companionCount={companions.length}
          onBack={() => setViewMode("bookshelf")}
          onEdit={handleEditTrip}
          onDestination={() => setIsTravelIdentityOpen(true)}
          onTravelers={() => setIsCompanionsOpen(true)}
          onShare={handleOpenShareModal}
          onSectionChange={setWorkspaceSection}
          onQuickAdd={() => setIsGlobalActionOpen(true)}
        >
          {workspaceSection === "overview" && currentPhase === "pre" && (
            <>
              <TripPlanOverview
                onRequestHumanHelp={handleRequestHumanHelp}
                onApplyPlanOption={handleApplyItineraryProposal}
                originLatitude={tripDestinationCoordinates?.latitude}
                originLongitude={tripDestinationCoordinates?.longitude}
                tripEndDate={tripEndDate}
                onPlanOptionsShown={(requestId, options) => recordPlanBehaviour("options_shown", requestId, options)}
                onPlanOptionSelected={(requestId, option, shown) => recordPlanBehaviour("option_selected", requestId, shown, option)}
                onPlanOptionDismissed={(requestId, option, shown) => recordPlanBehaviour("option_dismissed", requestId, shown, option)}
                onPlanAddedToItinerary={(requestId, option, shown, itemIds) => recordPlanBehaviour("added_to_itinerary", requestId, shown, option, itemIds)}
                budgetBrief={budgetBrief}
                onPublishServiceRequest={handlePublishServiceRequest}
                expenses={expenses}
                shoppingList={shoppingList}
                itinerary={itinerary}
                companionCount={companions.length}
                dateRange={tripDateRangeDisplay}
                onContinuePlanning={() => setWorkspaceSection("planning")}
                onEnterTripMode={() => handleWorkspacePhaseChange("during")}
                onExploreInspiration={() => {
                  setAppSection("community");
                  setViewMode("community");
                }}
                destination={tripDestination}
                destinationCountry={
                  travelCountry ||
                  detectDestinationFromTripName(tripDestination)?.country
                }
                travelRules={travelRules}
                hasPassport={Boolean(resolvedPassportId)}
                passportLabel={resolvedPassportLabel}
                onResearchEntryRules={() =>
                  handleResearchTravelRules(resolvedPassportId)
                }
                onOpenIdentity={() => setIsTravelIdentityOpen(true)}
                passportCountryCode={resolvedPassport?.countryCode}
                onSelectPassportCountry={handleSelectPassportCountry}
                onChangeDestination={handleDestinationFieldChange}
                tripStartDate={tripStartDate}
                communityPosts={communityPosts.filter((post) => post.status === "published")}
                onOpenPost={openSourceCommunityPost}
                savedInspirations={savedTravelInspirations}
                onTogglePreparationItem={handleTogglePreparationItem}
                onAddPreparationItems={(items) =>
                  handleBatchAddShoppingItems(items, "draft")
                }
              />
            </>
          )}
          {workspaceSection === "overview" && currentPhase === "during" && (
            <TripLiveOverview
              expenses={expenses}
              itinerary={itinerary}
              startDate={tripStartDate}
              endDate={tripEndDate}
              destination={tripDestination}
              destinationCoordinates={tripDestinationCoordinates}
              destinationCountry={
                tripDestinationDraft?.destinationCountry || travelCountry
              }
              onQuickAdd={handleWorkspaceQuickAdd}
              onOpenPlanning={() => setWorkspaceSection("planning")}
              onOpenRecords={() => setWorkspaceSection("records")}
            />
          )}
          {workspaceSection === "overview" && currentPhase === "during" && (
            /* The entry rules, cautions and local know-how do not stop being
               useful on the day you land — the arrival card is needed then more
               than ever. Now that the overview picks its stage from the dates,
               leaving them on the pre-trip screen alone would hide them exactly
               when they matter. */
            <TripPlanOverview
              onRequestHumanHelp={handleRequestHumanHelp}
              onApplyPlanOption={handleApplyItineraryProposal}
              originLatitude={tripDestinationCoordinates?.latitude}
              originLongitude={tripDestinationCoordinates?.longitude}
              tripEndDate={tripEndDate}
              onPlanOptionsShown={(requestId, options) => recordPlanBehaviour("options_shown", requestId, options)}
              onPlanOptionSelected={(requestId, option, shown) => recordPlanBehaviour("option_selected", requestId, shown, option)}
              onPlanOptionDismissed={(requestId, option, shown) => recordPlanBehaviour("option_dismissed", requestId, shown, option)}
              onPlanAddedToItinerary={(requestId, option, shown, itemIds) => recordPlanBehaviour("added_to_itinerary", requestId, shown, option, itemIds)}
              budgetBrief={budgetBrief}
              onPublishServiceRequest={handlePublishServiceRequest}
              variant="reference"
              expenses={expenses}
              shoppingList={shoppingList}
              itinerary={itinerary}
              companionCount={companions.length}
              dateRange={tripDateRangeDisplay}
              onContinuePlanning={() => setWorkspaceSection("planning")}
              onEnterTripMode={() => handleWorkspacePhaseChange("during")}
              onExploreInspiration={() => {
                setAppSection("community");
                setViewMode("community");
              }}
              destination={tripDestination}
              destinationCountry={
                travelCountry ||
                detectDestinationFromTripName(tripDestination)?.country
              }
              travelRules={travelRules}
              hasPassport={Boolean(resolvedPassportId)}
              passportLabel={resolvedPassportLabel}
              onResearchEntryRules={() =>
                handleResearchTravelRules(resolvedPassportId)
              }
              onOpenIdentity={() => setIsTravelIdentityOpen(true)}
              passportCountryCode={resolvedPassport?.countryCode}
              onSelectPassportCountry={handleSelectPassportCountry}
              onChangeDestination={handleDestinationFieldChange}
              tripStartDate={tripStartDate}
              communityPosts={communityPosts.filter((post) => post.status === "published")}
              onOpenPost={openSourceCommunityPost}
              savedInspirations={savedTravelInspirations}
              onTogglePreparationItem={handleTogglePreparationItem}
              onAddPreparationItems={(items) =>
                handleBatchAddShoppingItems(items, "draft")
              }
            />
          )}
          {workspaceSection === "planning" && planningContent}
          {workspaceSection === "records" && recordsContent}

          {isFormOpen && (
            <ExpenseForm
              currentPhase={expenseFormPhase || currentPhase}
              customCategories={customCategories}
              onAddCustomCategory={handleAddCustomCategory}
              onRemoveCustomCategory={handleRemoveCustomCategory}
              existingExpenses={expenses}
              companions={companions}
              ownerMemberId={activeOwnerMemberId}
              ownerName={authProfile?.displayName || userProfile.name || "我"}
              viewerMemberId={viewerMemberId}
              proposalMode={isProposalMode}
              initialCategory={initialFormCategory}
              initialDescription={initialFormDescription}
              initialAmount={initialFormAmount}
              initialCurrency={initialFormCurrency}
              linkedItemId={formLinkedItemId}
              initialData={editingExpense}
              taxRule={taxRule}
              travelRules={travelRules}
              onSubmit={handleSaveExpense}
              onClose={handleCloseForm}
              onRequestDelete={handleRequestDeleteFromForm}
              onManageMembers={() => setIsCompanionsOpen(true)}
            />
          )}
          {isCompanionsOpen && (
            <CompanionsModal
              companions={companions}
              ownerName={authProfile?.displayName || userProfile.name || "我"}
              friends={friends}
              onAdd={handleAddCompanion}
              onAddFriendToTrip={handleAddFriendToTrip}
              onRemove={handleRemoveCompanion}
              onClose={() => setIsCompanionsOpen(false)}
            />
          )}
          {isCountryModalOpen && (
            <CountrySettingsModal
              initialCountry={travelCountry}
              onSave={handleSaveCountry}
              onClose={() => setIsCountryModalOpen(false)}
              isLoading={isFetchingTaxRule}
            />
          )}
          {isTravelIdentityOpen && (
            <TravelIdentityModal
              tripId={activeDraftId || currentLoadedTripId}
              // The stored destination is often the whole trip title, because
              // creating a trip copies the name into it. 「釜山五日遊」 is a
              // title, not a place; show the place it names.
              destination={
                destinationLabel(
                  detectDestinationFromTripName(tripDestination) || {
                    country: tripDestination,
                  },
                ) || tripDestination
              }
              // Country falls back to the trip's own country: a destination
              // read from the title has no place record behind it, and the
              // entry rules are looked up by country, so it must not be blank.
              destinationCountry={
                tripDestinationDraft?.destinationCountry ||
                travelCountry ||
                detectDestinationFromTripName(tripDestination)?.country
              }
              startDate={tripStartDate}
              endDate={tripEndDate}
              passports={profilePassports}
              defaultPassportId={userProfile.defaultPassportId}
              selectedPassportId={selectedPassportId}
              travelRules={travelRules}
              onResearchTravelRules={handleResearchTravelRules}
              onSave={handleSaveTravelIdentity}
              onEditDestination={() => {
                // Closing first: leaving the modal open behind the setup screen
                // would put two destination fields on screen at once.
                setIsTravelIdentityOpen(false);
                setViewMode("tripSetup");
              }}
              onClose={() => setIsTravelIdentityOpen(false)}
            />
          )}
          {isVisaModalOpen && travelCountry && (
            <VisaCheckModal
              destination={travelCountry}
              defaultOrigin={originCountry}
              onClose={() => setIsVisaModalOpen(false)}
              onSaveInfo={handleSaveVisaInfo}
              onAddVisaExpense={handleAddVisaExpense}
            />
          )}
          <QRShareModal
            isOpen={isShareModalOpen}
            onClose={() => setIsShareModalOpen(false)}
            userId={userId}
            userName={userProfile.name}
            currentTripId={activeDraftId || currentLoadedTripId}
            currentTripName={
              currentTripName || (currentLoadedTripId ? "歷史旅程" : undefined)
            }
            onScanSuccess={handleScanSuccess}
          />
          {isGlobalActionOpen && (
            <GlobalActionSheet
              context={workspaceSection === "records" ? "wallet" : "travel"}
              onClose={() => setIsGlobalActionOpen(false)}
              onCreatePost={openCommunityComposer}
              onCreateTrip={() => {
                setIsGlobalActionOpen(false);
                handleCreateNewTrip();
              }}
              onAddPlace={() => {
                setIsGlobalActionOpen(false);
                setViewMode("bookshelf");
              }}
              onAddNote={() => {
                setIsGlobalActionOpen(false);
                setViewMode("bookshelf");
              }}
              onAiImport={() => {
                setIsGlobalActionOpen(false);
                setViewMode("tripSetup");
              }}
              onAddExpense={() => {
                setIsGlobalActionOpen(false);
                setViewMode("trip");
                // This one set no stage at all, so the form fell back to the
                // overview's — which is how 記帳 ＞ 旅行中 kept opening with
                // 行前 categories after the other five were unified.
                setExpenseFormPhase(phaseForNewExpense());
                setIsFormOpen(true);
              }}
            />
          )}
          {isSettlementOpen && (
            <div className={`fixed inset-0 ${OVERLAY.sheet} flex items-center justify-center bg-slate-950/40 p-3 sm:p-6`}>
              <div className="max-h-[85vh] w-full max-w-md overflow-y-auto">
                <SettlementFlow
                  expenses={expenses}
                  outstandingExpenses={outstandingExpenses}
                  members={buildTripMembers(
                    settlementTripId,
                    userId,
                    authProfile?.displayName || userProfile.name || "我",
                    companions,
                    friends,
                  )}
                  batches={settlementBatches}
                  tripId={settlementTripId}
                  onSaveBatch={handleSaveSettlementBatch}
                  onUpdateBatch={handleUpdateSettlementBatch}
                  onDeleteBatch={handleDeleteSettlementBatch}
                  onOpenDisputes={(expense) => setDisputeExpenseId(expense.id)}
                  viewerMemberId={viewerMemberId}
                  onClose={() => setIsSettlementOpen(false)}
                />
              </div>
            </div>
          )}
        </TripWorkspaceShell>
      </>
    );
  }

  return (
    <div className={containerClass}>
      {import.meta.env.DEV && (
        <DevViewerSwitcher
          roster={settlementMembers}
          viewerMemberId={viewerMemberId}
          resolvedMemberId={viewerResolution.memberId}
          resolvedReason={viewerResolution.reason}
          overrideMemberId={devViewerOverride}
          onOverride={setDevViewerOverride}
        />
      )}
      <ExpenseDisputeModal
        expense={expenses.find((e) => e.id === disputeExpenseId) || null}
        roster={settlementMembers}
        viewerMemberId={viewerMemberId}
        tripOwnerMemberId={activeOwnerMemberId}
        onClose={() => setDisputeExpenseId(null)}
        onRaise={(message) => {
          const target = expenses.find((e) => e.id === disputeExpenseId);
          if (target) handleRaiseDispute(target, message);
        }}
        onResolve={(disputeId, response) => {
          const target = expenses.find((e) => e.id === disputeExpenseId);
          if (target) handleResolveDispute(target, disputeId, response);
        }}
        onApprove={(disputeId, response) => {
          const target = expenses.find((e) => e.id === disputeExpenseId);
          if (target) handleApproveDisputeProposal(target, disputeId, response);
        }}
        onRevert={(disputeId) => {
          const target = expenses.find((e) => e.id === disputeExpenseId);
          if (target) handleRevertDisputeProposal(target, disputeId);
        }}
        onWithdraw={(disputeId) => {
          const target = expenses.find((e) => e.id === disputeExpenseId);
          if (target) handleWithdrawDispute(target, disputeId);
        }}
        onOpenExpense={(expense) => {
          setDisputeExpenseId(null);
          handleEditExpense(expense);
        }}
      />
      <ConfirmDialog
        request={confirmRequest}
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => {
          const pending = confirmRequest;
          // Close first: a second press finds nothing pending,
          // so an action can never run twice.
          setConfirmRequest(null);
          pending?.onConfirm();
        }}
      />
      <DeleteExpenseConfirmModal
        expense={pendingExpenseDeletion?.expense || null}
        adminCreatorName={pendingExpenseDeletion?.adminCreatorName}
        onCancel={() => setPendingExpenseDeletion(null)}
        onConfirm={handleConfirmExpenseDeletion}
      />
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-[60] flex items-center gap-2 text-sm font-bold animate-fade-in-down ${
            toast.type === "error"
              ? "bg-red-500 text-white"
              : "bg-gray-800 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <Trash2 size={16} className="text-white" />
          ) : (
            <CheckCircle size={16} className="text-emerald-400" />
          )}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-white pt-8 pb-4 px-6 sticky top-0 z-10 border-b border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={() => setViewMode("bookshelf")}
              className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 transition-colors flex-shrink-0"
              title="回到書架"
            >
              <ArrowLeft size={24} />
            </button>

            {/* Editable Trip Name & Date Range */}
            <div className="flex-1 min-w-0 mx-2">
              <input
                type="text"
                value={currentTripName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="點擊命名旅程..."
                className="text-xl font-black text-brand-900 tracking-tight bg-transparent border-b border-transparent hover:border-gray-300 focus:border-brand-500 outline-none w-full transition-all placeholder:text-gray-300"
              />
              {(expenses.length > 0 || tripStartDate) && (
                <div className="flex items-center gap-1 text-xs text-gray-400 font-bold mt-1 ml-0.5">
                  <CalendarDays size={12} />
                  {tripDateRangeDisplay}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleEditTrip}
                className="p-2.5 rounded-full bg-white text-gray-400 hover:bg-brand-50 hover:text-brand-600 transition-colors flex items-center justify-center"
                title="編輯旅程"
                aria-label="編輯旅程"
              >
                <Pencil size={19} />
              </button>
              <button
                onClick={() => setIsTravelIdentityOpen(true)}
                className={`p-2.5 rounded-full transition-colors flex items-center justify-center border-2 ${travelCountry ? "bg-brand-50 border-brand-200 text-brand-600" : "bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100"}`}
                title="旅行身分設定"
              >
                <Globe size={20} />
              </button>
              <button
                onClick={() => setIsCompanionsOpen(true)}
                className={`p-2.5 rounded-full transition-colors relative flex items-center justify-center ${companions.length > 0 ? "bg-brand-50 text-brand-600" : "text-gray-400 hover:bg-gray-100"}`}
                title="旅伴管理"
              >
                <Users size={20} />
                {companions.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white"></span>
                )}
              </button>
              <button
                onClick={handleOpenShareModal}
                className="p-2.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100 transition-colors flex items-center justify-center"
                title="共享帳本"
              >
                <Share2 size={20} />
              </button>
            </div>
          </div>
        </div>
        <PhaseSelector currentPhase={currentPhase} onChange={setCurrentPhase} />
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPhase}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="space-y-6 pb-24"
          >
            {/* API Key Warning */}
            {/* The 「AI 功能尚未啟用」 banner used to live here. It tested for a
                browser-side VITE_GEMINI_API_KEY, but the key moved to the
                server long ago — so it fired on a working app and told people
                to set a variable that no longer does anything. Each AI feature
                reports its own failure where it happens. */}

            {currentPhase === "summary" ? (
              /* Full Screen Summary View */
              <div className="space-y-6">
                <TripSummaryModal
                  expenses={expenses}
                  onArchive={handleArchiveTrip}
                  taxRule={taxRule}
                  variant="embedded"
                  initialTripName={currentTripName}
                  allowArchive={!currentLoadedTripId}
                />
                <button
                  onClick={handleGenerateTravelBook}
                  className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 hover:scale-[1.02] transition-transform"
                >
                  <Sparkles size={20} /> 產生 AI 旅程回憶錄
                </button>
              </div>
            ) : (
              /* Standard Phase Views */
              <>
                <ItineraryCalendar
                  items={itinerary}
                  startDate={tripStartDate}
                  endDate={tripEndDate}
                  destination={tripDestination}
                  destinationCountry={
                    tripDestinationDraft?.destinationCountry || travelCountry
                  }
                  onReorder={handleReorderItinerary}
                  onResequenceTimes={handleResequenceDayTimes}
                  onRescheduleItem={handleRescheduleItem}
                  onApplyFixedAdjustment={handleApplyFixedAdjustment}
                  onTogglePin={handleTogglePin}
                  onUpdateItem={handleUpdateItineraryItem}
                  onAdd={(date) => {
                    setItineraryFormDate(date);
                    setItineraryFormItem(null);
                  }}
                  onEdit={(item) => {
                    setItineraryFormDate(undefined);
                    setItineraryFormItem(item);
                  }}
                  onDelete={handleDeleteItineraryItem}
                />
                {itineraryFormItem !== undefined && (
                  <ItineraryItemForm
                    item={itineraryFormItem || undefined}
                    initialDate={itineraryFormDate}
                    startDate={tripStartDate}
                    endDate={tripEndDate}
                    destinationLatitude={tripDestinationCoordinates?.latitude}
                    destinationLongitude={tripDestinationCoordinates?.longitude}
                    destinationCountry={
                      tripDestinationDraft?.destinationCountry
                    }
                    travelCountry={travelCountry}
                    onSave={handleSaveItineraryItem}
                    onCancel={() => setItineraryFormItem(undefined)}
                  />
                )}
                <FlightAnchorsForm
                  anchors={flightAnchors}
                  onChange={setFlightAnchors}
                  destination={tripDestination}
                  startDate={tripStartDate}
                  endDate={tripEndDate}
                  flightMode={flightMode}
                  onFlightModeChange={setFlightMode}
                />
                <ItineraryPlanningAssistant
                  destination={tripDestination}
                  startDate={tripStartDate}
                  endDate={tripEndDate}
                  itinerary={itinerary}
                  inspirations={savedInspirations}
                  flights={flightAnchors}
                  onInspirationsChange={setSavedInspirations}
                  onApply={handleApplyItineraryProposal}
                />

                <Dashboard
                  members={buildTripMembers(
                    activeDraftId || currentLoadedTripId || "active",
                    userId,
                    authProfile?.displayName || userProfile.name || "我",
                    companions,
                    friends,
                  )}
                  expenses={selectSpendingExpenses(expenses)}
                  batches={settlementBatches}
                  companions={companions}
                  onExport={handleExport}
                  onAddCash={() => handleQuickAdd(Category.EXCHANGE)}
                  onAddExpense={handleSaveExpense}
                  currentPhase={currentPhase}
                  taxRule={taxRule}
                  travelRules={travelRules}
                  visaInfo={visaInfo}
                  onOpenSettlement={handleOpenSettlement}
                  viewerMemberId={viewerMemberId}
                />

                {/* Phase Specific Context Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                    {currentPhase === "pre" && <ShoppingBag size={120} />}
                    {currentPhase === "during" && <Globe size={120} />}
                    {currentPhase === "post" && <Award size={120} />}
                  </div>

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-black text-gray-900">
                          {currentPhase === "pre" && "行前準備"}
                          {currentPhase === "during" && "旅途記帳"}
                          {currentPhase === "post" && "回國結算"}
                        </h3>
                        <p className="text-xs text-gray-400 font-bold">
                          {currentPhase === "pre" && "規劃預算、準備必備物品"}
                          {currentPhase === "during" &&
                            "即時記錄每一筆旅途消費"}
                          {currentPhase === "post" && "辦理退稅、查看最終報表"}
                        </p>
                      </div>
                      <div className="bg-brand-50 text-brand-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                        {currentPhase}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {currentPhase === "pre" && (
                        <PreTripChecklist
                          onQuickAddCategory={handleQuickAdd}
                          expenses={expenses}
                        />
                      )}

                      {currentPhase === "post" && (
                        <PostTripChecklist
                          onQuickAddCategory={handleQuickAdd}
                          expenses={expenses}
                        />
                      )}

                      {/* Shared Shopping List Panel */}
                      <ShoppingListPanel
                        title={shoppingPanelTitle}
                        shoppingList={shoppingList.filter(
                          (item) => item.phase === currentPhase,
                        )}
                        onAddItem={handleAddShoppingItem}
                        onRemoveItem={handleRemoveShoppingItem}
                        onPurchaseItem={handlePurchaseShoppingItem}
                      />
                    </div>
                  </div>
                </div>

                {/* Expense List Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                      <Receipt size={18} className="text-gray-400" />
                      {currentPhase === "pre" && "準備清單"}
                      {currentPhase === "during" && "消費紀錄"}
                      {currentPhase === "post" && "機場消費"}
                    </h3>
                    <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-1 rounded-full uppercase tracking-tighter">
                      {filteredExpenses.length} ITEMS
                    </span>
                  </div>

                  <ExpenseList
                    expenses={filteredExpenses}
                    onDelete={handleDeleteExpense}
                    onEdit={handleEditExpense}
                    taxRule={taxRule}
                    viewerMemberId={viewerMemberId}
                    tripOwnerMemberId={activeOwnerMemberId}
                    onOpenDisputes={(expense) => setDisputeExpenseId(expense.id)}
                  />
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Action Button (Only show if NOT in summary) */}
      {currentPhase !== "summary" && (
        <div className="fixed bottom-6 right-6 z-40 md:absolute md:right-6 md:bottom-6">
          <button
            onClick={() => {
              setExpenseFormPhase(phaseForNewExpense());
              setIsFormOpen(true);
            }}
            className="bg-brand-600 hover:bg-brand-700 text-white p-4 rounded-full shadow-lg shadow-brand-500/30 transition-transform hover:scale-105 active:scale-95 flex items-center justify-center"
          >
            <Plus size={28} />
          </button>
        </div>
      )}

      {/* Expense Modal */}
      {isFormOpen && (
        <ExpenseForm
          currentPhase={
            expenseFormPhase ||
            (currentPhase === "summary" ? "post" : currentPhase)
          }
          customCategories={customCategories}
          onAddCustomCategory={handleAddCustomCategory}
          onRemoveCustomCategory={handleRemoveCustomCategory}
          existingExpenses={expenses}
          companions={companions}
          ownerMemberId={activeOwnerMemberId}
              ownerName={authProfile?.displayName || userProfile.name || "我"}
              viewerMemberId={viewerMemberId}
              proposalMode={isProposalMode}
          initialCategory={initialFormCategory}
          initialDescription={initialFormDescription}
          initialAmount={initialFormAmount}
          initialCurrency={initialFormCurrency}
          linkedItemId={formLinkedItemId}
          initialData={editingExpense}
          taxRule={taxRule}
          travelRules={travelRules}
          onSubmit={handleSaveExpense}
          onClose={handleCloseForm}
          onRequestDelete={handleRequestDeleteFromForm}
          onManageMembers={() => setIsCompanionsOpen(true)}
        />
      )}

      {isSettlementOpen && (
        <div className={`fixed inset-0 ${OVERLAY.sheet} flex items-center justify-center bg-slate-950/40 p-3 sm:p-6`}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto">
            <SettlementFlow
              expenses={expenses}
              outstandingExpenses={outstandingExpenses}
              members={buildTripMembers(
                settlementTripId,
                userId,
                authProfile?.displayName || userProfile.name || "我",
                companions,
                friends,
              )}
              batches={settlementBatches}
              tripId={settlementTripId}
              onSaveBatch={handleSaveSettlementBatch}
              onUpdateBatch={handleUpdateSettlementBatch}
              onDeleteBatch={handleDeleteSettlementBatch}
              onOpenDisputes={(expense) => setDisputeExpenseId(expense.id)}
              viewerMemberId={viewerMemberId}
              onClose={() => setIsSettlementOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Companions Modal */}
      {isCompanionsOpen && (
        <CompanionsModal
          companions={companions}
          ownerName={authProfile?.displayName || userProfile.name || "我"}
          friends={friends}
          onAdd={handleAddCompanion}
          onAddFriendToTrip={handleAddFriendToTrip}
          onRemove={handleRemoveCompanion}
          onClose={() => setIsCompanionsOpen(false)}
        />
      )}

      {/* Country Settings Modal */}
      {isCountryModalOpen && (
        <CountrySettingsModal
          initialCountry={travelCountry}
          onSave={handleSaveCountry}
          onClose={() => setIsCountryModalOpen(false)}
          isLoading={isFetchingTaxRule}
        />
      )}
      {isTravelIdentityOpen && (
        <TravelIdentityModal
          tripId={activeDraftId || currentLoadedTripId}
          destination={tripDestination}
          destinationCountry={tripDestinationDraft?.destinationCountry}
          startDate={tripStartDate}
          endDate={tripEndDate}
          passports={profilePassports}
          defaultPassportId={userProfile.defaultPassportId}
          selectedPassportId={selectedPassportId}
          travelRules={travelRules}
          onResearchTravelRules={handleResearchTravelRules}
          onSave={handleSaveTravelIdentity}
          onClose={() => setIsTravelIdentityOpen(false)}
        />
      )}

      {/* Visa Check Modal (New) */}
      {isVisaModalOpen && travelCountry && (
        <VisaCheckModal
          destination={travelCountry}
          defaultOrigin={originCountry}
          onClose={() => setIsVisaModalOpen(false)}
          onSaveInfo={handleSaveVisaInfo}
          onAddVisaExpense={handleAddVisaExpense}
        />
      )}

      {/* Travel Book Modal */}
      {isTravelBookOpen && travelBook && (
        <div className={`fixed inset-0 ${OVERLAY.alert} flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in`}>
          <div className="w-full max-w-lg relative">
            <button
              onClick={() => setIsTravelBookOpen(false)}
              className="absolute -top-12 right-0 text-white hover:text-brand-200 transition-colors"
            >
              <Plus size={32} className="rotate-45" />
            </button>
            <TravelBookView
              book={travelBook}
              onShare={() => showToast("分享功能即將推出！")}
            />
          </div>
        </div>
      )}

      <QRShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        userId={userId}
        userName={userProfile.name}
        currentTripId={activeDraftId || currentLoadedTripId}
        currentTripName={
          currentTripName || (currentLoadedTripId ? "歷史旅程" : undefined)
        }
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
};

export default App;
