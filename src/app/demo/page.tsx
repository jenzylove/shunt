import { redirect } from "next/navigation";

// The desk is the demo: no sign up, live Bitget data, four ready examples. /demo just opens it.
export default function Demo() {
  redirect("/#desk");
}
