import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tavern Table", short_name: "Tavern Table", description: "An online tabletop compatible with fifth edition.",
    start_url: "/", display: "standalone", background_color: "#120f0c", theme_color: "#120f0c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
