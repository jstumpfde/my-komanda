// Server component — pass-through layout for /settings/*
// Existing settings pages each render their own DashboardSidebar + DashboardHeader.
// This layout simply forwards children without wrapping, preserving backward compatibility.
// Sub-navigation is rendered by each page via the SettingsSubNav component below.

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
