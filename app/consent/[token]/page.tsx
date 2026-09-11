import { ConsentFlow } from './ConsentFlow'

export const dynamic = 'force-dynamic'

export default function ConsentPage({
  params,
}: {
  params: { token: string }
}) {
  return <ConsentFlow token={params.token} />
}
