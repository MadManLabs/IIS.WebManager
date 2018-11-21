import { Injectable } from '@angular/core'
import { AppContextService } from '@microsoft/windows-admin-center-sdk/angular'
import { PowerShell, PowerShellSession } from '@microsoft/windows-admin-center-sdk/core'
import 'rxjs/add/operator/catch'
import { Observable } from 'rxjs'
import { PowerShellScripts } from '../../../../generated/powershell-scripts'
import { Request, Response, ResponseOptions, Headers } from '@angular/http'

const PS_SESSION_KEY = '475e8b48-d4c4-4624-b719-f041067cb5fb'

@Injectable()
export class PowershellService {
  private session: Observable<PowerShellSession>
  private sessionId = Math.random().toString(36).substring(2, 15) // TODO: modify this with WAC session ID

  constructor(private appContext: AppContextService) {
    this.session = this.appContext.servicesReady.take(1).map(_ => {
      console.log(`initializing powershell service`)
      return this.appContext.powerShell.createSession(this.appContext.activeConnection.nodeName, PS_SESSION_KEY)
    }).shareReplay()
  }

  public run<T>(pwCmdString: string, psParameters: any): Observable<T> {
    psParameters.sessionId = this.sessionId
    return this.invoke(pwCmdString, psParameters)
  }

  public invokeHttp(req: Request): Observable<Response> {
    let requestEncoded = btoa(JSON.stringify(req))
    console.log(`request ${JSON.stringify(req)}`)
    return this.invoke<ResponseOptions>(
      PowerShellScripts.local_http,
      { requestBase64: requestEncoded },
      (k, v) => {
        if (k === "body") {
          return atob(v)
        } else if (k === "headers") {
          // we need to explicitly wrap it otherwise when we pass it to new Response(res), the header would remain a plain object
          return new Headers(v)
        }
        return v
      }).map(res => {
        let response = new Response(res)
        console.log(`response: ${JSON.stringify(res)}\nrequest ${JSON.stringify(req)}`)
        if (res.status < 200 || res.status >= 400) {
          throw response
        }
        return response
    })
  }

  private invoke<T>(pwCmdString: string, psParameters: any, reviver: (key: any, value: any) => any = null): Observable<T> {
    var compiled = PowerShell.createScript(pwCmdString, psParameters)
    var name = pwCmdString.split('\n')[0]
    return this.session.mergeMap(ps => ps.powerShell.run(compiled).mergeMap(response => {
      if (!response) {
        throw `Powershell command ${name} returns no response`;
      }

      if (!response.results) {
        throw `Powershell command ${name} returns null response`;
      }

      if (response.results.length <= 0) {
        throw `Powershell command ${name} returns empty response`;
      }
      return response.results.map(result => {
        return JSON.parse(result, reviver)
      })
    }))
  }
}