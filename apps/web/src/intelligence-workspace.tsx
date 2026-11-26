import { useEffect, useState } from 'react';
import type { AdaptivePolicy } from './adaptive';
import type { Locale } from './i18n';
import { createDetachedCapabilitySession } from './capability-session';
import { IntelligencePanel } from './intelligence-panel';

export default function IntelligenceWorkspace({locale,offline,policy,onClose}:{
  locale:Locale;offline:boolean;policy:AdaptivePolicy;onClose:()=>void;
}) {
  const [session,setSession]=useState<ReturnType<typeof createDetachedCapabilitySession>>();
  useEffect(()=>{
    const lifetime=new AbortController();
    const runtime=createDetachedCapabilitySession(lifetime.signal);
    setSession(runtime);
    return ()=>{ lifetime.abort();runtime.dispose(); };
  },[]);
  useEffect(()=>session?.setPolicy(policy),[session,policy]);
  return session && <IntelligencePanel locale={locale} offline={offline} execute={session.run} onClose={onClose}/>;
}
