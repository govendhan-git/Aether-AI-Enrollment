import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/enroll(.*)'
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const a = await auth();
    if (!a.userId) {
      return a.redirectToSignIn();
    }
  }
});

export const config = {
  matcher: [
    '/((?!.+\.[\w]+$|_next).*)',
    '/(api|trpc)(.*)'
  ]
};
