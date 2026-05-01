import { useState, useEffect } from 'react';

export interface TeleprompterSettings {
  voiceMode: boolean;
  speed: number;
  fontSize: number;
  opacity: number;
  textColor: string;
  autoPlayDelay: number;
}

const DEFAULT_SETTINGS: TeleprompterSettings = {
  voiceMode: false,
  speed: 30,
  fontSize: 26,
  opacity: 95,
  textColor: 'text-slate-300',
  autoPlayDelay: 1,
};

export function useTeleprompterSettings() {
  const [settings, setSettings] = useState<TeleprompterSettings>(() => {
    try {
      const saved = localStorage.getItem('gescall_teleprompter_settings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Error parsing teleprompter settings', e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('gescall_teleprompter_settings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = <K extends keyof TeleprompterSettings>(key: K, value: TeleprompterSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return { settings, updateSetting };
}
