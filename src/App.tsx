import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { InterviewPanel } from '@/components/InterviewPanel';
import { AvatarTestRoute } from '@/components/AvatarTestRoute';
import { warmApi } from '@/lib/api';
import { AnimatedBackground } from '@/components/AnimatedBackground';

function App() {
  useEffect(() => { void warmApi(); }, []);
  if (import.meta.env.DEV && window.location.pathname === '/avatar-test') return <AvatarTestRoute />;
  return (
    <div className="app-viewport">
      <AnimatedBackground />
      <MotionConfig reducedMotion="user"><div className="app-shell"><InterviewPanel /></div></MotionConfig>
    </div>
  );
}

export default App;
