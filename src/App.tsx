import './App.css';
import { useEffect, useRef, useState, useCallback } from 'react';
import { AppBar, IconButton, Toolbar, Typography } from '@mui/material';
import { Settings as SettingsIcon } from '@mui/icons-material';
import createWorld from './createWorld';
import config from './config';
import { moveAnts, sandFall } from './util';
import SettingsDialog from './components/SettingsDialog';
import WorldContainer from './components/WorldContainer';

const VERSION = '0.0.2';

// 16:9 aspect ratio to favor widescreen monitors, letterboxing will occur on all other sizes.
const WORLD_WIDTH = 96 * 1.5;
const WORLD_HEIGHT = 54 * 1.5;

function App() {
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const lastWorldUpdateTimeMsRef = useRef(0);

  const [settings, setSettings] = useState(() => {
    const savedSettingsJson = localStorage.getItem('antfarm-settings');
    const savedSettings = savedSettingsJson ? JSON.parse(savedSettingsJson) as (typeof config & { version: string }) : null;
    
    if (!savedSettings) {
      return config;
    }

    const { version, ...settings } = savedSettings;
    return version === VERSION ? settings : config;
  });

  const createNewWorld = useCallback(() => {
    return createWorld(WORLD_WIDTH, WORLD_HEIGHT, settings.initialDirtPercent, settings.initialAntCount);
  }, [settings.initialDirtPercent, settings.initialAntCount])

  const [world, setWorld] = useState(() => {
    const savedWorldJson = localStorage.getItem('antfarm-world');
    const savedWorld = savedWorldJson ? JSON.parse(savedWorldJson) as (ReturnType<typeof createNewWorld> & { version: string }) : null;
    
    if (!savedWorld) {
      return createNewWorld();
    }

    const { version, ...world } = savedWorld;
    return version === VERSION ? world : createNewWorld();
  });

  // Main loop for updating world state. Try to run every N ms (configurable), play catch-up if multiple
  // ticks are pending. This can occur in various scenarios. For example, if configured tick rate is very low,
  // or if browser tab is inactive then setInterval will slow to once-per-second.
  useEffect(() => {
    let intervalId = 0;

    function updateWorld(deltaMs: number) {
      const elapsedTicks = Math.floor(deltaMs / settings.tickRateMs);
      if (elapsedTicks === 0) {
        return;
      }
      
      setWorld(world => {
        // TODO: Prefer immutable world instead of breaking world reference (it's too expensive)
        let updatedWorld = JSON.parse(JSON.stringify(world));
        for (let tickCount = 0; tickCount < elapsedTicks; tickCount++) {
          updatedWorld.ants = moveAnts(updatedWorld, settings.probabilities);
          sandFall(updatedWorld, settings.compactSandDepth);
        }
  
        return updatedWorld;
      });
    }

    function handleInterval() {
      const timestamp = performance.now();
      const delta = timestamp - lastWorldUpdateTimeMsRef.current;
      if (delta > settings.tickRateMs) {
        lastWorldUpdateTimeMsRef.current = timestamp;
        updateWorld(delta);
      }
    }

    intervalId = window.setInterval(handleInterval, 60 / 1000);

    return () => {
      window.clearInterval(intervalId);
    }
  }, [settings.tickRateMs, settings.compactSandDepth, settings.probabilities]);

  // TODO: idk how to write this properly just yet. it's wrong that setInterval would get set/cleared frequently,
  // but world is updated a lot and it's no good if a stale world is saved
  useEffect(() => {
    function saveWorld() {
      localStorage.setItem('antfarm-world', JSON.stringify({ ...world, version: VERSION }));
    }

    function onWindowUnload() {
      saveWorld();
    }

    window.addEventListener('unload', onWindowUnload, true);

    const intervalId = window.setInterval(() => {
      saveWorld();
    }, settings.autoSaveIntervalMs);

    return () => {
      window.removeEventListener('unload', onWindowUnload);
      window.clearInterval(intervalId);
    };
  }, [world, settings.autoSaveIntervalMs]);

  useEffect(() => {
    function saveSettings() {
      localStorage.setItem('antfarm-settings', JSON.stringify({ ...settings, version: VERSION }));
    }

    saveSettings();
  }, [settings]);

  function handleSettingsClick(){
    setIsSettingsDialogOpen(true);
  }

  function handleSettingsDialogClose() {
    setIsSettingsDialogOpen(false);
  }

  function handleResetWorld() {
    localStorage.removeItem('antfarm-world');
    setWorld(createNewWorld());
    setIsSettingsDialogOpen(false);
  }

  function handleResetSettings() {
    localStorage.removeItem('antfarm-settings');
    setSettings(config);
    setIsSettingsDialogOpen(false);
  }

  return (
    <div className="App">
      <AppBar color="transparent" elevation={0}>
        <Toolbar variant="dense">
          <Typography sx={{ flexGrow: 1 }} color="primary">
            Ant Farm
          </Typography>
          <IconButton onClick={handleSettingsClick}>
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <SettingsDialog
        open={isSettingsDialogOpen}
        onClose={handleSettingsDialogClose}
        onResetWorld={handleResetWorld}
        onResetSettings={handleResetSettings}
        onSettingsChange={updatedSettings => setSettings({ ...settings, ...updatedSettings })}
        settings={settings}
      />

      <WorldContainer world={world} antColor={settings.antColor} />
    </div>
  );
}

export default App;