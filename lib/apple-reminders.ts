import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const APPLE_REMINDER_LISTS = ['PLAN B to do', 'PRIVÉ to do'] as const;

type SupportedSourceList = (typeof APPLE_REMINDER_LISTS)[number];

export interface AppleReminder {
  id: string;
  title: string;
  dueDateTime?: string;
  priority: number;
  completed: boolean;
  notes?: string;
  sourceList: SupportedSourceList;
}

export interface AppleRemindersFetchResult {
  reminders: AppleReminder[];
  available: boolean;
  warning?: string;
}

function normalizeReminder(raw: any): AppleReminder | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.title || !raw.sourceList) return null;
  if (!APPLE_REMINDER_LISTS.includes(raw.sourceList)) return null;

  return {
    id: String(raw.id),
    title: String(raw.title),
    dueDateTime: raw.dueDateTime ? String(raw.dueDateTime) : undefined,
    priority: Number(raw.priority ?? 0),
    completed: Boolean(raw.completed),
    notes: raw.notes ? String(raw.notes) : undefined,
    sourceList: raw.sourceList,
  };
}

// Phase 1 adapter:
// - Native implementation only on macOS via AppleScript.
// - All other environments return a safe empty fallback.
export async function fetchAppleReminders(): Promise<AppleRemindersFetchResult> {
  if (process.platform !== 'darwin') {
    return {
      reminders: [],
      available: false,
      warning: 'Apple Reminders sync is only available on macOS. Using safe fallback (no reminders imported).',
    };
  }

  const script = `
    on esc(theText)
      set AppleScript's text item delimiters to "\\"
      set escapedText to every text item of theText
      set AppleScript's text item delimiters to "\\\\"
      set escapedText to escapedText as text
      set AppleScript's text item delimiters to "\""
      set escapedText to every text item of escapedText
      set AppleScript's text item delimiters to "\\\""
      set escapedText to escapedText as text
      set AppleScript's text item delimiters to ""
      return escapedText
    end esc

    set jsonItems to ""
    tell application "Reminders"
      set targetLists to {"PLAN B to do", "PRIVÉ to do"}
      repeat with listName in targetLists
        try
          set theList to list listName
          repeat with r in reminders of theList
            set rid to id of r
            set rname to name of r
            set rbody to body of r
            set rcompleted to completed of r
            set rpriority to priority of r
            set dueValue to ""
            try
              set dueValue to due date of r as string
            end try

            set itemJson to "{\"id\":\"" & esc(rid) & "\",\"title\":\"" & esc(rname) & "\",\"dueDateTime\":\"" & esc(dueValue) & "\",\"priority\":" & rpriority & ",\"completed\":" & (rcompleted as string) & ",\"notes\":\"" & esc(rbody) & "\",\"sourceList\":\"" & esc(listName) & "\"}"

            if jsonItems is "" then
              set jsonItems to itemJson
            else
              set jsonItems to jsonItems & "," & itemJson
            end if
          end repeat
        end try
      end repeat
    end tell

    return "[" & jsonItems & "]"
  `;

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script], { maxBuffer: 1024 * 1024 * 5 });
    const parsed = JSON.parse(stdout.trim() || '[]');

    const deduped = new Map<string, AppleReminder>();
    for (const item of parsed) {
      const normalized = normalizeReminder(item);
      if (!normalized) continue;
      deduped.set(normalized.id, normalized); // deduplicate by reminder id
    }

    return {
      reminders: Array.from(deduped.values()),
      available: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reminders: [],
      available: false,
      warning: `Apple Reminders read failed. Safe fallback active. ${message}`,
    };
  }
}
