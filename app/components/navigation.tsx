"use client";

import {
  useEffect,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
} from "react";

export function navigate(path: string) {
  if (window.location.pathname + window.location.search !== path)
    window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(initialPath: string) {
  const [path, setPath] = useState(initialPath);
  useEffect(() => {
    const update = () =>
      setPath(window.location.pathname.replace(/\/$/, "") || "/");
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return path;
}

export function AppLink({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const activate = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank"
    )
      return;
    event.preventDefault();
    navigate(href);
  };
  return <a {...props} href={href} onClick={activate} />;
}
