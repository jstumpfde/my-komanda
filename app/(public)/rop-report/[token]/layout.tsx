// Layout публичного отчёта AI-РОП (ссылка руководителю, без логина).
// Пред-пейнт скрипт применяет сохранённую тему (localStorage rop-report-theme)
// ДО отрисовки — иначе при тёмной теме мигал бы светлый фон (страница рендерится
// внутри общего app/layout.tsx, где ThemeProvider из next-themes уже мог
// проставить .dark по СВОЕЙ схеме — этот скрипт сознательно независим и
// выполняется следом, переопределяя класс под предпочтение именно для отчёта,
// чтобы анонимный посетитель по ссылке не зависел от темы чужой сессии).
const THEME_INIT = `
try {
  var t = localStorage.getItem('rop-report-theme');
  if (t === 'dark') document.documentElement.classList.add('dark');
  else if (t === 'light') document.documentElement.classList.remove('dark');
} catch (e) {}
`

export default function RopReportLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      <div className="min-h-screen bg-background">{children}</div>
    </>
  )
}
