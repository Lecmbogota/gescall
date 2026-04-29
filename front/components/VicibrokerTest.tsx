import { useState, useEffect } from 'react';
import vicibroker from '@/services/vicibroker';
import type { CampaignStatusRow, ListCountRow } from '@/services/vicibroker';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';

export function VicibrokerTest() {
  const [connected, setConnected] = useState(false);
  const [campaignsData, setCampaignsData] = useState<CampaignStatusRow[]>([]);
  const [listsData, setListsData] = useState<ListCountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check connection status
    setConnected(vicibroker.isConnected());
  }, []);

  const testConnection = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('=== VICIBROKER TEST START ===');

      // Connect
      console.log('1. Connecting to Vicibroker...');
      vicibroker.connect();

      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 1000));

      const isConnected = vicibroker.isConnected();
      console.log('2. Connection status:', isConnected);
      setConnected(isConnected);

      if (!isConnected) {
        throw new Error('Failed to connect to Vicibroker');
      }

      // Test campaigns query
      const campaigns = ['LEGAXI01', 'LEGAXI03'];
      console.log('3. Sending campaigns_status query for:', campaigns);

      const campaignsResult = await vicibroker.campaignsStatus(campaigns);
      console.log('4. Campaigns result:', campaignsResult);

      if (campaignsResult.ok && campaignsResult.rows) {
        console.log('5. Campaigns data:', campaignsResult.rows);
        setCampaignsData(campaignsResult.rows);
      } else {
        console.error('5. Campaigns query failed:', campaignsResult.error);
        throw new Error(campaignsResult.error || 'No campaigns data');
      }

      // Test lists query
      console.log('6. Sending lists_count_by_campaign query for:', campaigns);

      const listsResult = await vicibroker.listsCountByCampaign(campaigns);
      console.log('7. Lists result:', listsResult);

      if (listsResult.ok && listsResult.rows) {
        console.log('8. Lists data:', listsResult.rows);
        setListsData(listsResult.rows);
      } else {
        console.error('8. Lists query failed:', listsResult.error);
        throw new Error(listsResult.error || 'No lists data');
      }

      console.log('=== VICIBROKER TEST SUCCESS ===');

    } catch (err) {
      console.error('=== VICIBROKER TEST FAILED ===', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg border border-slate-200">
      <h2 className="text-xl font-bold mb-4">Vicibroker Connection Test</h2>

      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">Connection Status:</span>
          <span className={`px-2 py-1 rounded text-sm ${
            connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-medium">Vicibroker URL:</span>
          <span className="text-sm font-mono">http://209.38.233.46:8095</span>
        </div>
      </div>

      <Button
        onClick={testConnection}
        disabled={loading}
        className="mb-4"
      >
        {loading ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            Testing...
          </>
        ) : (
          'Run Test'
        )}
      </Button>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {campaignsData.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold mb-2">Campaigns Data ({campaignsData.length} campaigns):</h3>
          <div className="bg-slate-50 p-3 rounded overflow-auto max-h-64">
            <pre className="text-xs">{JSON.stringify(campaignsData, null, 2)}</pre>
          </div>
        </div>
      )}

      {listsData.length > 0 && (
        <div className="mb-4">
          <h3 className="font-bold mb-2">Lists Data ({listsData.length} lists):</h3>
          <div className="bg-slate-50 p-3 rounded overflow-auto max-h-64">
            <pre className="text-xs">{JSON.stringify(listsData, null, 2)}</pre>
          </div>
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
        <strong>Instructions:</strong>
        <ol className="list-decimal ml-4 mt-2 space-y-1">
          <li>Click "Run Test" to test the connection</li>
          <li>Open browser console (F12) to see detailed logs</li>
          <li>Check if campaigns and lists data appear below</li>
          <li>If it fails, verify Vicibroker is running at the URL above</li>
        </ol>
      </div>
    </div>
  );
}
