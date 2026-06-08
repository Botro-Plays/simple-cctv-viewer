import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { electronAPI } from '../lib/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    pinLockEnabled: false,
    pin: '',
    autoStartEnabled: false,
    minimizeToTray: true,
    defaultQuality: 'MEDIUM',
    retentionDays: 7,
    maxRecordingSizeGB: 50,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    electronAPI.getSettings()
      .then((data) => {
        setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      await electronAPI.updateSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure application preferences</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Application behavior settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Minimize to System Tray</label>
                  <p className="text-sm text-muted-foreground">
                    Keep application running in background when minimized
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.minimizeToTray}
                  onChange={(e) => setSettings({ ...settings, minimizeToTray: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Start with Windows</label>
                  <p className="text-sm text-muted-foreground">
                    Automatically launch application on system startup
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoStartEnabled}
                  onChange={(e) => setSettings({ ...settings, autoStartEnabled: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>Access control settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">PIN Lock</label>
                  <p className="text-sm text-muted-foreground">
                    Require PIN to access the application
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pinLockEnabled}
                  onChange={(e) => setSettings({ ...settings, pinLockEnabled: e.target.checked })}
                  className="w-5 h-5"
                />
              </div>

              {settings.pinLockEnabled && (
                <div>
                  <label className="font-medium mb-2 block">PIN Code</label>
                  <Input
                    type="password"
                    value={settings.pin}
                    onChange={(e) => setSettings({ ...settings, pin: e.target.value })}
                    placeholder="Enter 4-digit PIN"
                    maxLength={4}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Streaming</CardTitle>
              <CardDescription>Default streaming quality preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="font-medium mb-2 block">Default Quality</label>
                <Select
                  value={settings.defaultQuality}
                  onChange={(e) => setSettings({ ...settings, defaultQuality: e.target.value as any })}
                >
                  <option value="LOW">Low (Mobile)</option>
                  <option value="MEDIUM">Medium (Balanced)</option>
                  <option value="HIGH">High (Maximum)</option>
                </Select>
                <p className="text-sm text-muted-foreground mt-1">
                  Default quality when opening camera streams
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recording</CardTitle>
              <CardDescription>Recording and storage settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="font-medium mb-2 block">Retention Period (Days)</label>
                <Input
                  type="number"
                  value={settings.retentionDays}
                  onChange={(e) => setSettings({ ...settings, retentionDays: parseInt(e.target.value) || 7 })}
                  min={1}
                  max={365}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Automatically delete recordings older than this period
                </p>
              </div>

              <div>
                <label className="font-medium mb-2 block">Max Recording Size (GB)</label>
                <Input
                  type="number"
                  value={settings.maxRecordingSizeGB}
                  onChange={(e) => setSettings({ ...settings, maxRecordingSizeGB: parseInt(e.target.value) || 50 })}
                  min={1}
                  max={1000}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Stop recording when total size exceeds this limit
                </p>
              </div>
            </CardContent>
          </Card>

          {saveError && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-md text-sm">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="bg-green-500/10 border border-green-500 text-green-600 dark:text-green-400 px-4 py-2 rounded-md text-sm">
              Settings saved successfully.
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
