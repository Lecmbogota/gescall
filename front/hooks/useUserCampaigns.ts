import { useAuthStore } from '@/stores/authStore';
import type { Campaign } from '@/stores/authStore';

/**
 * Custom hook to access user campaigns from auth store
 *
 * This hook provides easy access to the authenticated user's campaigns
 * for use in queries to Vicibroker or other services.
 *
 * @returns Object with user campaign data and utility functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { campaigns, campaignIds, hasCampaigns, user } = useUserCampaigns();
 *
 *   if (!hasCampaigns) {
 *     return <div>No campaigns available</div>;
 *   }
 *
 *   // Use campaignIds for Vicibroker queries
 *   const result = await vicibroker.campaignsStatus(campaignIds);
 *
 *   return (
 *     <div>
 *       {campaigns.map(camp => (
 *         <div key={camp.id}>{camp.name}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useUserCampaigns() {
  const {
    getCampaigns,
    getCampaignIds,
    getUser,
    hasPermission,
    isLogged
  } = useAuthStore();

  const user = getUser();
  const campaigns = getCampaigns();
  const campaignIds = getCampaignIds();

  return {
    /**
     * Full campaign objects with id, name, and active status
     */
    campaigns,

    /**
     * Array of campaign IDs (strings) for API queries
     */
    campaignIds,

    /**
     * Whether user has any campaigns assigned
     */
    hasCampaigns: campaignIds.length > 0,

    /**
     * Total number of campaigns
     */
    campaignCount: campaignIds.length,

    /**
     * Current authenticated user
     */
    user,

    /**
     * Whether user is logged in
     */
    isLogged: isLogged(),

    /**
     * Check if user has permission for a specific campaign
     */
    hasAccessToCampaign: (campaignId: string) => hasPermission(campaignId),

    /**
     * Get campaign by ID
     */
    getCampaignById: (campaignId: string): Campaign | undefined => {
      return campaigns.find(c => c.id === campaignId);
    },

    /**
     * Get only active campaigns
     */
    getActiveCampaigns: (): Campaign[] => {
      return campaigns.filter(c => c.active);
    },

    /**
     * Get only active campaign IDs
     */
    getActiveCampaignIds: (): string[] => {
      return campaigns.filter(c => c.active).map(c => c.id);
    },
  };
}
