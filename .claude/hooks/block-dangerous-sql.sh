#!/usr/bin/env bash
# PreToolUse(Bash) guard — блокирует опасный SQL в любом месте Bash-команды
# (psql -c "...", heredoc, пайп и т.д.) ДО выполнения.
#
# Получает на stdin JSON хука, читает .tool_input.command, схлопывает переводы
# строк/табы (чтобы ловить heredoc-многострочники) и матчит по подстроке
# без учёта регистра. При совпадении возвращает permissionDecision=deny.
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

# схлопываем \n и \t в пробелы — иначе "DELETE\nFROM" из heredoc проскочит
norm=$(printf '%s' "$cmd" | tr '\n\t' '  ')

# Требуем границу слова перед ключевым словом ([^alnum_] или начало строки),
# чтобы не ловить подстроки в идентификаторах/именах файлов
# (например t_truncate, truncateText, mydelete). TRUNCATE требует пробела после
# (TRUNCATE TABLE x / TRUNCATE x), DELETE/DROP — следующего ключевого слова.
PATTERN='(^|[^[:alnum:]_])(DROP[[:space:]]+TABLE|DROP[[:space:]]+DATABASE|TRUNCATE[[:space:]]+|DELETE[[:space:]]+FROM)'

if printf '%s' "$norm" | grep -iqE "$PATTERN"; then
  cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Заблокировано хуком: опасный SQL (DROP TABLE / DROP DATABASE / TRUNCATE / DELETE FROM) обнаружен в Bash-команде. Если это действительно нужно — выполни вручную в терминале вне Claude Code."}}
JSON
  exit 0
fi

# нет совпадений — ничего не выводим, команда выполняется как обычно
exit 0
