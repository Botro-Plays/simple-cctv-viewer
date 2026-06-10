import React, { useEffect, useState } from 'react';
import { Camera, CameraTemplate } from '../../../electron/shared/types';
import { useCameraStore } from '../stores/camera-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from '../components/ui/dialog';
import { Plus, Trash2, Edit, Check, ToggleLeft, ToggleRight } from 'lucide-react';
import { electronAPI } from '../lib/api';

interface CamerasProps {
  showAddForm?: boolean;
  onFormClose?: () => void;
}

export default function Cameras({ showAddForm: externalShowAddForm, onFormClose }: CamerasProps) {
  const { cameras, setCameras, isLoading, setLoading, addCamera, updateCamera, deleteCamera } = useCameraStore();
  const [showAddForm, setShowAddForm] = useState(externalShowAddForm || false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [templates, setTemplates] = useState<CameraTemplate[]>([]);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    loadCameras();
    loadTemplates();
  }, []);

  useEffect(() => {
    if (externalShowAddForm !== undefined) {
      setShowAddForm(externalShowAddForm);
    }
  }, [externalShowAddForm]);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await electronAPI.getCameras();
      setCameras(data);
    } catch (error) {
      console.error('Failed to load cameras:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await electronAPI.getTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const handleSave = async (camera: Omit<Camera, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setActionError('');
      if (editingCamera) {
        await electronAPI.updateCamera(editingCamera.id, camera);
        updateCamera(editingCamera.id, camera);
      } else {
        const newCamera = await electronAPI.addCamera(camera);
        addCamera(newCamera);
      }
      setShowAddForm(false);
      setEditingCamera(null);
      onFormClose?.();
      loadCameras();
    } catch (error: any) {
      setActionError(error.message || 'Failed to save camera');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this camera?')) {
      try {
        setActionError('');
        await electronAPI.deleteCamera(id);
        deleteCamera(id);
      } catch (error: any) {
        setActionError(error.message || 'Failed to delete camera');
      }
    }
  };

  const handleToggleEnabled = async (camera: Camera) => {
    try {
      setActionError('');
      await electronAPI.updateCamera(camera.id, { enabled: !camera.enabled });
      updateCamera(camera.id, { enabled: !camera.enabled });
    } catch (error: any) {
      setActionError(error.message || 'Failed to update camera');
    }
  };

  if (isLoading) {
    return <div className="h-full overflow-auto p-6">Loading cameras...</div>;
  }


  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cameras</h1>
          <p className="text-muted-foreground">Manage your CCTV cameras</p>
        </div>
        <Button onClick={() => {
          setShowAddForm(true);
          setEditingCamera(null);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Camera
        </Button>
      </div>

      <Dialog open={showAddForm || !!editingCamera} onOpenChange={(open) => {
        if (!open) {
          setShowAddForm(false);
          setEditingCamera(null);
          onFormClose?.();
        }
      }}>
        <CameraForm
          camera={editingCamera || undefined}
          templates={templates}
          onSave={handleSave}
          onCancel={() => {
            setShowAddForm(false);
            setEditingCamera(null);
            onFormClose?.();
          }}
          existingCameras={cameras}
        />
      </Dialog>

      {actionError && (
        <div className="mb-4 bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-md text-sm">
          {actionError}
        </div>
      )}

      <div className="grid gap-4">
        {cameras.map((camera) => (
          <Card key={camera.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{camera.name}</h3>
                    <Badge variant={camera.enabled ? 'default' : 'secondary'}>
                      {camera.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Badge variant="outline">{camera.brand}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {camera.rtspUrl}:{camera.port}{camera.mainStreamPath}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Quality: {camera.preferredQuality}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    title={camera.enabled ? 'Disable camera' : 'Enable camera'}
                    onClick={() => handleToggleEnabled(camera)}
                  >
                    {camera.enabled
                      ? <ToggleRight className="w-4 h-4 text-green-500" />
                      : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCamera(camera)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(camera.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CameraForm({
  camera,
  templates,
  onSave,
  onCancel,
  existingCameras,
}: {
  camera?: Camera;
  templates: CameraTemplate[];
  onSave: (camera: Omit<Camera, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  existingCameras: Camera[];
}) {
  const [formData, setFormData] = useState<Partial<Camera>>(
    camera || {
      name: '',
      brand: '',
      rtspUrl: '',
      port: 554,
      username: '',
      password: '',
      mainStreamPath: '',
      subStreamPath: '',
      preferredQuality: 'MEDIUM',
      enabled: true,
    }
  );
  const [error, setError] = useState('');

  const handleTemplateChange = (brand: string) => {
    const template = templates.find((t) => t.brand === brand);
    if (template) {
      setFormData({
        ...formData,
        brand: template.brand,
        port: template.defaultPort,
        mainStreamPath: template.mainStreamPath,
        subStreamPath: template.subStreamPath,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.name || !formData.rtspUrl || !formData.mainStreamPath) {
      setError('Please fill in all required fields');
      return;
    }

    // Check for duplicate LAN IP (rtspUrl)
    const isDuplicate = existingCameras.some((cam) => 
      cam.id !== camera?.id &&
      cam.rtspUrl === formData.rtspUrl
    );

    if (isDuplicate) {
      setError('A camera with this LAN IP already exists');
      return;
    }

    onSave(formData as Omit<Camera, 'id' | 'createdAt' | 'updatedAt'>);
  };

  // Reset form when camera prop changes (for edit mode)
  React.useEffect(() => {
    if (camera) {
      setFormData(camera);
    } else {
      setFormData({
        name: '',
        brand: '',
        rtspUrl: '',
        port: 554,
        username: '',
        password: '',
        mainStreamPath: '',
        subStreamPath: '',
        preferredQuality: 'MEDIUM',
        enabled: true,
      });
    }
  }, [camera]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{camera ? 'Edit Camera' : 'Add New Camera'}</DialogTitle>
        <DialogDescription>
          Configure your CCTV camera connection settings
        </DialogDescription>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-2 rounded-md text-sm">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Camera Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Front Door Camera"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Brand (Template)</label>
              <Select
                value={formData.brand}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                <option value="">Select brand...</option>
                {templates.map((t) => (
                  <option key={t.brand} value={t.brand}>
                    {t.brand}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">RTSP URL (IP)</label>
              <Input
                value={formData.rtspUrl}
                onChange={(e) => setFormData({ ...formData, rtspUrl: e.target.value })}
                placeholder="192.168.1.100"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Port</label>
              <Input
                type="number"
                value={formData.port || 554}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 554 })}
                placeholder="554"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Username</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="admin"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Password</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Main Stream Path</label>
              <Input
                value={formData.mainStreamPath}
                onChange={(e) => setFormData({ ...formData, mainStreamPath: e.target.value })}
                placeholder="/Streaming/Channels/101"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Sub Stream Path (Optional)</label>
              <Input
                value={formData.subStreamPath}
                onChange={(e) => setFormData({ ...formData, subStreamPath: e.target.value })}
                placeholder="/Streaming/Channels/102"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Preferred Quality</label>
            <Select
              value={formData.preferredQuality}
              onChange={(e) => setFormData({ ...formData, preferredQuality: e.target.value as any })}
            >
              <option value="LOW">Low (Mobile)</option>
              <option value="MEDIUM">Medium (Balanced)</option>
              <option value="HIGH">High (Maximum)</option>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="enabled" className="text-sm font-medium">
              Enable this camera
            </label>
          </div>
        </form>
      </DialogContent>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" onClick={handleSubmit}>
          <Check className="w-4 h-4 mr-2" />
          {camera ? 'Update' : 'Add'} Camera
        </Button>
      </DialogFooter>
    </>
  );
}
