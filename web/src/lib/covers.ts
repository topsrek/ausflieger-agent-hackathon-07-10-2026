// Cover photos for the trip header, keyed by city (lowercase). Wikimedia Commons, verified URLs.
export interface Cover {
  url: string;
  credit: string;
}

const COVERS: Record<string, Cover> = {
  munich: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Frauenkirche_Munich_-_View_from_Peterskirche_Tower2.jpg/1280px-Frauenkirche_Munich_-_View_from_Peterskirche_Tower2.jpg',
    credit: 'Photo: Diliff, Wikimedia Commons, CC BY 2.5',
  },
};
COVERS['münchen'] = COVERS.munich;

export function coverFor(city: string): Cover | null {
  return COVERS[city.trim().toLowerCase()] ?? null;
}
