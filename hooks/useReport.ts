'use client';

import { useState, useCallback } from 'react';

export function useReport() {
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportType, setReportType] = useState<'month' | 'half'>('month');
  const [reportFullscreen, setReportFullscreen] = useState(false);

  const handleShowReport = useCallback((text: string, type: 'month' | 'half') => {
    setReportText(text); setReportType(type); setShowReport(true); setReportFullscreen(true);
  }, []);

  return { showReport, setShowReport, reportText, reportType, reportFullscreen, setReportFullscreen, handleShowReport };
}
