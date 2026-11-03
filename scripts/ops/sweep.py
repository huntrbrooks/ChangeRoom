"""Run bounded cleanup via a dedicated Postgres login. Never emit the DSN or DB error bodies."""
import os
import subprocess
from urllib.parse import unquote, urlsplit


def main():
    uri = urlsplit(os.environ['CHANGEROOM_SWEEP_DSN'])
    if uri.scheme not in ('postgresql','postgres') or not uri.hostname or not uri.username or not uri.path.strip('/'):
        raise SystemExit('Invalid sweep connection configuration')
    # libpq does not expand a URL provided as PGDATABASE. Pass individual fields as
    # environment variables, keeping all credentials out of process args and logs.
    env = {k:v for k,v in os.environ.items() if k not in ('CHANGEROOM_SWEEP_DSN','PGDATABASE','PGPASSWORD','PGSERVICE')}
    env.update(PGHOST=uri.hostname, PGPORT=str(uri.port or 5432), PGDATABASE=unquote(uri.path[1:]),
               PGUSER=unquote(uri.username), PGPASSWORD=unquote(uri.password or ''), PGCONNECT_TIMEOUT='10',
               PGOPTIONS='-c statement_timeout=25000 -c lock_timeout=4000')
    if uri.hostname not in ('127.0.0.1','localhost','::1'):
        env.update(PGSSLMODE='verify-full', PGSSLROOTCERT='system')

    def query(stmt):
        r=subprocess.run(['psql','-XAtq','-F',' ','-v','ON_ERROR_STOP=1','-c',stmt],capture_output=True,text=True,env=env,timeout=40)
        if r.returncode: raise SystemExit('Postgres operation failed; check TLS, execute grants, migrations and server health.')
        return r.stdout.strip()

    query('SELECT public.tryon_sweep()')
    fields=query('SELECT * FROM public.tryon_ops_counts()').split(' ')
    if len(fields)!=5 or not all(f.isdecimal() for f in fields): raise SystemExit('Unexpected job-count result')
    stuck,images,history,failed,succeeded=map(int,fields)
    print(f'stale_jobs={stuck} expired_results={images} expired_history={history} recent_failed={failed} recent_succeeded={succeeded}')
    if stuck or images or history: raise SystemExit('Cleanup overdue; investigate throughput or locks.')
    if failed>=5 and failed>=succeeded: raise SystemExit('At least five recent failures, at least half of completed jobs.')


if __name__=='__main__': main()
