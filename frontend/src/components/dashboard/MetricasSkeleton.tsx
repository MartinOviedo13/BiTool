import React from 'react';

export const MetricasSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-fade-in">
      {/* 4 KPI Cards Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-[#0b1a33]/85 p-5 rounded-2xl border border-[#1e3659] shadow-lg shadow-black/20 animate-pulse space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 bg-[#132747] rounded-md" />
              <div className="h-9 w-9 bg-[#132747] rounded-xl" />
            </div>
            <div className="h-8 w-36 bg-[#132747] rounded-lg mt-2" />
            <div className="flex items-center gap-2 pt-1">
              <div className="h-4 w-16 bg-[#132747] rounded-full" />
              <div className="h-3 w-20 bg-[#132747] rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Top 5 Prendas Estrella Skeleton */}
      <div className="bg-[#0b1a33]/85 p-5 rounded-2xl border border-[#1e3659] shadow-lg shadow-black/20 animate-pulse space-y-4">
        <div className="flex items-center justify-between border-b border-[#1e3659] pb-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-[#132747] rounded-md" />
            <div className="h-4 w-44 bg-[#132747] rounded-md" />
          </div>
          <div className="h-3 w-24 bg-[#132747] rounded-md" />
        </div>

        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="p-3 rounded-xl bg-[#071326]/60 border border-[#1e3659]/50 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-6 h-6 rounded-lg bg-[#132747]" />
                <div className="space-y-1.5 flex-1 max-w-xs">
                  <div className="h-4 w-32 bg-[#132747] rounded-md" />
                  <div className="h-2 w-full bg-[#132747] rounded-full" />
                </div>
              </div>
              <div className="h-5 w-24 bg-[#132747] rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
