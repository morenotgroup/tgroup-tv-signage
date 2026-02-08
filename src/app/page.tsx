import SignageV2 from "@/signage/SignageV2";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function Page(_props: PageProps) {
  // O SignageV2 lê ?tv=1 no client (TV mode)
  return <SignageV2 />;
}
