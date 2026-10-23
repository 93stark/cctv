import { json } from "@/server/http";
import { userRoute } from "@/server/routes";
import { setProfilePhoto } from "@/server/services/profile";

export const dynamic = "force-dynamic";

export const POST = userRoute(async ({ db, req, userId }) => {
  const photoUrl = await setProfilePhoto(db, userId, req);
  return json({ photoUrl });
});
