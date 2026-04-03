import type { ParsedProjectTask } from "./planner-types";
import { parseMsProjectXmlDocument } from "./import/xml/parse-ms-project-xml";

/** Legacy flat list for API preview / outline-based import — same rules as WBS tree parser. */
export function parseProjectXml(xmlContent: string): ParsedProjectTask[] {
  const { flat } = parseMsProjectXmlDocument(xmlContent);
  return flat.map((t) => ({
    uid: t.uid,
    wbs_code: t.wbs,
    name: t.name,
    start_date: t.start ?? "",
    end_date: t.finish ?? "",
    duration_days: t.durationDays,
    outline_level: t.outlineLevel,
    is_summary: t.summary,
    predecessors: t.predecessors,
  }));
}
