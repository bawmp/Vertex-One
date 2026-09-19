import Link from "next/link";

export function PiedPage() {
  return (
    <footer className="pt-8 text-center text-xs text-stone-400">
      Page propulsée par{" "}
      <Link href="/" className="font-medium text-stone-500 underline-offset-2 hover:text-primary hover:underline">
        Vertex One
      </Link>
    </footer>
  );
}
