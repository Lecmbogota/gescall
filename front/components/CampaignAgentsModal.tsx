import React, { useState, useEffect } from 'react';

interface User {
  user_id: number;
  username: string;
  role: string;
  active: boolean;
}

interface CampaignAgentsModalProps {
  campaignId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export const CampaignAgentsModal: React.FC<CampaignAgentsModalProps> = ({ campaignId, isOpen, onClose, onSave }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && campaignId) {
      fetchData();
    }
  }, [isOpen, campaignId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch all users
      const usersRes = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const usersData = await usersRes.json();
      
      // Fetch currently assigned agents
      const assignedRes = await fetch(`/api/campaigns/${campaignId}/agents`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const assignedData = await assignedRes.json();

      if (usersData.success) {
        // Filter out non-agents if necessary, but here we can just show all or filter by role === 'AGENT'
        // For flexibility, showing all users but you can filter if needed.
        setUsers(usersData.data);
      }
      if (assignedData.success) {
        setAssignedAgents(assignedData.agents);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAgent = (username: string) => {
    if (assignedAgents.includes(username)) {
      setAssignedAgents(assignedAgents.filter(u => u !== username));
    } else {
      setAssignedAgents([...assignedAgents, username]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ agents: assignedAgents })
      });
      const data = await res.json();
      if (data.success) {
        onSave();
        onClose();
      } else {
        alert('Error saving agents');
      }
    } catch (err) {
      console.error('Error saving agents:', err);
      alert('Error saving agents');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1C1C1E] p-6 rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white tracking-tight">Asignar Agentes</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            {users.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No hay usuarios disponibles.</p>
            ) : (
              users.map(user => (
                <div 
                  key={user.user_id} 
                  className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all border ${
                    assignedAgents.includes(user.username) 
                      ? 'bg-indigo-500/10 border-indigo-500/30' 
                      : 'bg-white/5 border-transparent hover:bg-white/10'
                  }`}
                  onClick={() => toggleAgent(user.username)}
                >
                  <div className="flex flex-col">
                    <span className="text-white font-medium">{user.username}</span>
                    <span className="text-sm text-gray-400">{user.role || 'Usuario'}</span>
                  </div>
                  <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
                    assignedAgents.includes(user.username)
                      ? 'bg-indigo-500 border-indigo-500 text-white'
                      : 'border-gray-500 text-transparent'
                  }`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-gray-300 hover:bg-white/5 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl transition-colors font-medium shadow-lg shadow-indigo-500/25"
          >
            {saving ? 'Guardando...' : 'Guardar Asignación'}
          </button>
        </div>
      </div>
    </div>
  );
};
