import { useState, useCallback } from "react";
import { DynamicIsland } from "./components/DynamicIsland";
import "./App.css";

export default function App() {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = useCallback((nextState: boolean) => {
    setIsExpanded(nextState);
  }, []);


  return (
    <div
      className="app-canvas flex justify-center items-start pt-[7px] pr-[56px] select-none pointer-events-none"
      onDragEnter={(e) => e.preventDefault()}
      onDragOver={(e) => e.preventDefault()}
    >
      <DynamicIsland isExpanded={isExpanded} onToggle={handleToggle} />
    </div>
  );
}
