export const toolbarColors = {
  text:  { light: { bg: "#EEEDFE", icon: "#534AB7" }, dark: { bg: "#1e1e2a", icon: "#AFA9EC" } },
  image: { light: { bg: "#FBEAF0", icon: "#993556" }, dark: { bg: "#1a1524", icon: "#ED93B1" } },
  video: { light: { bg: "#FAECE7", icon: "#993C1D" }, dark: { bg: "#1f1218", icon: "#F09595" } },
  audio: { light: { bg: "#E1F5EE", icon: "#0F6E56" }, dark: { bg: "#0f2018", icon: "#5DCAA5" } },
  file:  { light: { bg: "#E6F1FB", icon: "#185FA5" }, dark: { bg: "#1a1e28", icon: "#85B7EB" } },
  info:  { light: { bg: "#EFF6FF", icon: "#2563EB" }, dark: { bg: "#172030", icon: "#60A5FA" } },
  test:  { light: { bg: "#EAF3DE", icon: "#3B6D11" }, dark: { bg: "#0f2418", icon: "#4ADE80" } },
  task:  { light: { bg: "#FAEEDA", icon: "#854F0B" }, dark: { bg: "#1f1a0e", icon: "#FBBF24" } },
} as const

export type ToolbarBlockType = keyof typeof toolbarColors
