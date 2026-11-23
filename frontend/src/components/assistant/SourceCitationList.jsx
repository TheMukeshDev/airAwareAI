import { safeExternalUrl } from "../../lib/utils";

export function SourceCitationList({ sources }) {
  if (!sources?.length) return null;
  return (
    <p className="mt-2 border-t border-white/8 pt-1.5 text-[10px] text-slate-400">
      Sources:{" "}
      {sources.map((source, index) => {
        const title = typeof source === "string" ? source : source?.title ?? source?.name ?? "Source";
        const rawUrl = typeof source === "string" ? null : source?.url;
        const url = safeExternalUrl(rawUrl);
        return (
          <span key={`${title}-${index}`}>
            {index > 0 ? " · " : null}
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-slate-300">
                {title}
              </a>
            ) : (
              title
            )}
          </span>
        );
      })}
    </p>
  );
}

export default SourceCitationList;
