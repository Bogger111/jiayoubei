import JiaYouBeiApp from "../JiaYouBeiApp";

export default async function SlugPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <JiaYouBeiApp initialPath={`/${slug.join("/")}`} />;
}
