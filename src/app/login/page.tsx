import LoginForm from './login-form'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; verified?: string; next?: string }>
}) {
  const params = await searchParams
  return <LoginForm reset={params.reset} verified={params.verified} />
}
