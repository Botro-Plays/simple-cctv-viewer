import React, { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Cameras from './pages/Cameras';
import Settings from './pages/Settings';
import LogPanel from './components/LogPanel';
import { Button } from './components/ui/button';
import { Video, Settings as SettingsIcon, Info, RefreshCw, Moon, Sun, Terminal } from 'lucide-react';
import { electronAPI } from './lib/api';

type Page = 'dashboard' | 'cameras' | 'settings' | 'about';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [showAddCamera, setShowAddCamera] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [showLogsPanel, setShowLogsPanel] = useState(false);

  useEffect(() => {
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
  };

  const renderPage = () => {
    return (
      <>
        <div className={currentPage === 'dashboard' ? 'h-full' : 'hidden'}>
          <Dashboard onAddCamera={() => { setCurrentPage('cameras'); setShowAddCamera(true); }} />
        </div>
        <div className={currentPage === 'cameras' ? 'h-full' : 'hidden'}>
          <Cameras showAddForm={showAddCamera} onFormClose={() => setShowAddCamera(false)} />
        </div>
        <div className={currentPage === 'settings' ? 'h-full' : 'hidden'}>
          <Settings />
        </div>
        <div className={currentPage === 'about' ? 'h-full' : 'hidden'}>
          <About />
        </div>
      </>
    );
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <nav className="shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 md:px-6 py-2 md:py-3 flex items-center gap-2 md:gap-4 overflow-x-auto z-50">
        <Button
          variant={currentPage === 'dashboard' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('dashboard')}
          size="sm"
          className="whitespace-nowrap"
        >
          <Video className="w-4 h-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Dashboard</span>
        </Button>
        <Button
          variant={currentPage === 'cameras' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('cameras')}
          size="sm"
          className="whitespace-nowrap"
        >
          Cameras
        </Button>
        <Button
          variant={currentPage === 'settings' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('settings')}
          size="sm"
          className="whitespace-nowrap"
        >
          <SettingsIcon className="w-4 h-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
        <Button
          variant={showLogsPanel ? 'default' : 'ghost'}
          onClick={() => setShowLogsPanel(v => !v)}
          size="sm"
          className="whitespace-nowrap"
        >
          <Terminal className="w-4 h-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Logs</span>
        </Button>
        <Button
          variant={currentPage === 'about' ? 'default' : 'ghost'}
          onClick={() => setCurrentPage('about')}
          size="sm"
          className="whitespace-nowrap"
        >
          <Info className="w-4 h-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">About</span>
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleRefresh} className="whitespace-nowrap">
          <RefreshCw className="w-4 h-4 mr-1 md:mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        <Button variant="outline" size="sm" onClick={toggleTheme} className="whitespace-nowrap">
          {isDark ? <Sun className="w-4 h-4 mr-1 md:mr-2" /> : <Moon className="w-4 h-4 mr-1 md:mr-2" />}
          <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
        </Button>
      </nav>
      <main className="flex-1 min-h-0 overflow-hidden">
        {renderPage()}
      </main>
      {showLogsPanel && <LogPanel onClose={() => setShowLogsPanel(false)} />}
    </div>
  );
}

function About() {
  const [version, setVersion] = useState<string>('...');

  useEffect(() => {
    electronAPI.getVersion().then(setVersion).catch(() => setVersion('unknown'));
  }, []);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">About Randiris Home CCTV-Viewer</h1>
        <div className="space-y-4">
          <p className="text-muted-foreground">
            A lightweight, self-hosted CCTV viewer application designed for home use.
            Supports multiple cameras, RTSP streams, and provides a modern interface
            for monitoring your security cameras.
          </p>
          <div className="border rounded-lg p-4 bg-card">
            <h2 className="text-lg font-semibold mb-2">Features</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>Multi-camera support (up to 32 cameras)</li>
              <li>Grid layouts (1x1, 2x2, 3x3, 4x4)</li>
              <li>MJPEG live streaming via FFmpeg</li>
              <li>Camera templates for popular brands</li>
              <li>Paged camera grid with navigation</li>
            </ul>
          </div>
          <div className="border rounded-lg p-4 bg-card">
            <h2 className="text-lg font-semibold mb-2">Supported Brands</h2>
            <p className="text-sm text-muted-foreground">
              Hikvision, Dahua, TP-Link Tapo, Xiaomi, Reolink, Ezviz, IMOU
            </p>
          </div>
          <div className="border rounded-lg p-4 bg-card">
            <h2 className="text-lg font-semibold mb-2">Developer</h2>
            <p className="text-sm text-muted-foreground">Botro</p>
          </div>
          <div className="border rounded-lg p-4 bg-card">
            <h2 className="text-lg font-semibold mb-2">Version</h2>
            <p className="text-sm text-muted-foreground">{version}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
