import { Terminal } from "@/components/terminal";

// A static shell: every live value (prices, book, account) is fetched in the
// browser, so there is nothing for the server to render per request.
export default function Page() {
  return <Terminal />;
}
