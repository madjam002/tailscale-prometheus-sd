import * as fsSync from 'fs'
import * as fs from 'fs/promises'
import { spawn } from 'child_process'
import { eventChannel, runSaga } from 'redux-saga'
import { call, take } from 'redux-saga/effects'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamValues } from 'stream-json/streamers/StreamValues'
import { getMatch } from 'ip-matching'
import { isIP } from 'net'
import { Transform } from 'stream'

if (!process.env.TAILSCALE_PROMETHEUS_SD_CONFIG) {
  console.error('TAILSCALE_PROMETHEUS_SD_CONFIG is not provided, must be a valid JSON file')
  process.exit(1)
}

if (!process.env.PROMETHEUS_TARGETS_OUT) {
  console.error('PROMETHEUS_TARGETS_OUT is not provided, must be a path for where the prometheus targets json file will be written')
  process.exit(1)
}

const config = JSON.parse(fsSync.readFileSync(process.env.TAILSCALE_PROMETHEUS_SD_CONFIG, 'utf8'))

const ipProtocolToUse = config.ipProtocol ?? 4 // whether to use IPv4 or IPv6 addresses

interface TailscaleService {
  Proto: string
  Port: number
  Description: string
}

interface TailscalePeer {
  ID: number
  Name?: string
  Addresses?: string[]
  Hostinfo?: {
    Services?: TailscaleService[]
    OS?: string
    OSVersion?: string
    Hostname?: string
  }
  Online: boolean
}

interface TailscaleNetMap {
  Peers: TailscalePeer[]
}

async function program() {
  await runSaga({}, mainSaga).toPromise()
}

program()

function* mainSaga() {
  const monitorStateChannel = yield call(
    tailscaleStateMonitor,
  )

  console.log('Started monitoring Tailscale')

  while (true) {
    const netMap: TailscaleNetMap = yield take(monitorStateChannel)

    yield call(netMapToServiceDiscoveryFile, netMap)
  }
}

async function netMapToServiceDiscoveryFile(netMap: TailscaleNetMap) {
  const collectedServices: Array<{
    peer: TailscalePeer
    service: TailscaleService
    matcher: any
    ipToUse: string
  }> = []

  for (const peer of netMap.Peers) {
    for (const service of peer.Hostinfo?.Services ?? []) {
      const matcher = config.matchers.find(matcher =>
        service.Proto === 'tcp' &&
        (matcher.description != null ? matcher.description === service.Description : true) &&
        (matcher.port != null ? matcher.port === service.Port : true)
      )

      if (matcher != null) {
        const ipToUse = peer.Addresses?.map(addr => {
          const ip = (getMatch(addr) as any).range.left.input
          const ipType = isIP(ip)

          if (ipType === ipProtocolToUse) {
            return ip
          } else {
            return null
          }
        }).find(addr => addr != null)

        if (ipToUse != null) {
          collectedServices.push({ peer, service, matcher, ipToUse })
        }
      }
    }
  }

  const targetsOut: any[] = []

  for (const svc of collectedServices) {
    targetsOut.push({
      targets: [
        `${svc.ipToUse}:${svc.service.Port.toString()}`
      ],
      labels: {
        ...(svc.matcher.labels ?? {}),
        node: svc.peer.Name ?? undefined,
        hostname: svc.peer.Hostinfo.Hostname ?? undefined,
      },
    })
  }

  await fs.writeFile(process.env.PROMETHEUS_TARGETS_OUT, JSON.stringify(targetsOut, null, 2))
}

function tailscaleStateMonitor() {
  const netMap: any = {}

  return eventChannel((emitter) => {
    const monitor = spawn(
      'tailscale',
      ['debug', 'watch-ipn', '-netmap=true'],
      {},
    )

    const tailscaleMonitorStreamFilter = new Transform({
      transform(chunk, encoding, callback) {
        if (chunk.toString().trim() === 'Connected.') {
          console.log('Connected')
          callback(null, '{}')
          return
        }
        callback(null, chunk)
      },
    })

    chain([
      monitor.stdout,
      tailscaleMonitorStreamFilter,
      parser({ jsonStreaming: true }),
      streamValues(),
      ({ value: object }: any) => {
        if (object?.NetMap != null) {
          Object.assign(netMap, object.NetMap)
          emitter(netMap)
        }
      },
    ])

    monitor.on('close', () => {
      console.log('Tailscale monitor exited')
      process.exit(1)
    })
    return () => {
      monitor.kill('SIGTERM')
    }
  })
}
