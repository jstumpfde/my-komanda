// Универсальный интерфейс адаптера подключённого источника (диска) — общий
// контракт для Яндекс.Диска (фаза 1) и будущих WebDAV/Google Drive/Dropbox
// (концепт kb-connected-sources §arch «Один движок, четыре адаптера»).
//
// supportsNativeDelta=false → синк идёт полным краулом папки + md5-диффом
// (Яндекс.Диск, WebDAV — у обоих нет дешёвого курсора изменений). true →
// курсор-дельта (Google Drive changes.list, Dropbox cursor+longpoll) —
// фаза 3+, здесь ещё не реализовано, но интерфейс уже предусматривает поле.

export interface SourceFileMeta {
  /** Абсолютный путь на диске провайдера — ключ идентичности (externalPath). */
  path: string
  name: string
  isDir: boolean
  mimeType: string | null
  sizeBytes: number | null
  modifiedAt: Date | null
  /** md5/etag провайдера — используется для диффа изменившихся файлов. */
  contentHash: string | null
}

export interface SourceAdapter {
  readonly provider: string
  readonly supportsNativeDelta: boolean

  /** Прямые дети папки (без рекурсии) — для дерева выбора папок в UI. */
  listChildren(accessToken: string, path: string): Promise<SourceFileMeta[]>

  /** Рекурсивный обход папки — отдаёт только файлы (не директории). */
  crawlFolder(accessToken: string, rootPath: string): AsyncGenerator<SourceFileMeta>

  /** Скачивает содержимое файла целиком в память (см. extract.ts MAX_FILE_SIZE). */
  downloadContent(accessToken: string, path: string): Promise<Buffer>
}
