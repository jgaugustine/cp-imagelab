import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useCallback, useMemo, useState } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { FilterInstance, FilterKind, defaultParamsFor } from "./types/transformations";

const queryClient = new QueryClient();

const App = () => {
  // Instance-based pipeline lifted to the top-level app
  const generateId = useCallback(() => {
    const g: any = (typeof crypto !== 'undefined' ? crypto : undefined) as any;
    if (g && typeof g.randomUUID === 'function') {
      return g.randomUUID();
    }
    return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }, []);
  const [pipeline, setPipeline] = useState<FilterInstance[]>(() => {
    const kinds: FilterKind[] = ['hue', 'vibrance', 'saturation', 'contrast', 'brightness'];
    return kinds.map(kind => ({
      id: typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function' ? (crypto as any).randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
      kind,
      params: defaultParamsFor(kind),
      enabled: true,
    }));
  });
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);

  // Actions: add, duplicate, delete, toggle enable, reorder, and update params
  const addInstance = useCallback((kind: FilterKind) => {
    const id = generateId();
    const instance: FilterInstance = {
      id,
      kind,
      params: defaultParamsFor(kind),
      enabled: true,
    };
    setPipeline(prev => [instance, ...prev]);
    setSelectedInstanceId(id);
  }, [generateId]);

  const duplicateInstance = useCallback((id: string) => {
    setPipeline(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx === -1) return prev;
      const original = prev[idx];
      const dup: FilterInstance = {
        ...original,
        id: generateId(),
      };
      const next = [...prev];
      // Insert duplicate right after the original (which will appear below it visually)
      next.splice(idx + 1, 0, dup);
      return next;
    });
  }, [generateId]);

  const deleteInstance = useCallback((id: string) => {
    setPipeline(prev => prev.filter(p => p.id !== id));
    setSelectedInstanceId(cur => (cur === id ? null : cur));
  }, []);

  const toggleInstance = useCallback((id: string) => {
    setPipeline(prev => prev.map(p => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  }, []);

  const reorderInstances = useCallback((activeId: string, overId: string) => {
    setPipeline(prev => {
      const oldIndex = prev.findIndex(p => p.id === activeId);
      const newIndex = prev.findIndex(p => p.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  }, []);

  const updateInstanceParams = useCallback(<K extends FilterKind>(id: string, updater: (prev: FilterInstance) => FilterInstance) => {
    setPipeline(prev => prev.map(inst => (inst.id === id ? updater(inst) : inst)));
    setSelectedInstanceId(id);
  }, []);

  const pipelineApi = useMemo(() => ({
    addInstance,
    duplicateInstance,
    deleteInstance,
    toggleInstance,
    reorderInstances,
    updateInstanceParams,
  }), [addInstance, duplicateInstance, deleteInstance, toggleInstance, reorderInstances, updateInstanceParams]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <Index
                  // New pipeline props (not yet consumed by children until subsequent steps)
                  pipeline={pipeline}
                  setPipeline={setPipeline}
                  selectedInstanceId={selectedInstanceId}
                  setSelectedInstanceId={setSelectedInstanceId}
                  pipelineApi={pipelineApi}
                />
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
