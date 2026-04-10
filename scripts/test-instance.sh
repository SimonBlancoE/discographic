#!/usr/bin/env bash

set -euo pipefail

usage() {
	cat <<'EOF'
Usage:
  bash scripts/test-instance.sh start [--host HOST] [--port PORT]
  bash scripts/test-instance.sh stop [--host HOST] [--port PORT]

Options:
  -H, --host  Host/IP to publish (default: 127.0.0.1)
  -p, --port  Published port (default: 3801)

Seeded users:
  admin-demo / demo12345
  user-demo  / demo12345
EOF
}

fail() {
	printf 'Error: %s\n' "$1" >&2
	exit 1
}

sanitize_name() {
	printf '%s' "$1" | tr -c 'A-Za-z0-9' '-'
}

parse_args() {
	host='127.0.0.1'
	port='3801'

	while [ "$#" -gt 0 ]; do
		case "$1" in
		-H | --host)
			[ "$#" -ge 2 ] || fail "missing value for $1"
			host="$2"
			shift 2
			;;
		-p | --port)
			[ "$#" -ge 2 ] || fail "missing value for $1"
			port="$2"
			shift 2
			;;
		--help | -h)
			usage
			exit 0
			;;
		*)
			fail "unknown argument: $1"
			;;
		esac
	done

	case "$port" in
	'' | *[!0-9]*)
		fail 'port must be numeric'
		;;
	esac

	if [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
		fail 'port must be between 1 and 65535'
	fi
}

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
compose_args=(-f docker-compose.test.yml)

compose() {
	(
		cd "$repo_root"
		TEST_HOST="$host" \
			TEST_PORT="$port" \
			DISCOGRAPHIC_CONTAINER_NAME="$container_name" \
			docker compose -p "$project_name" "${compose_args[@]}" "$@"
	)
}

wait_for_health() {
	local health_url attempt response_file http_code body

	health_url="http://${host}:${port}/api/health"

	for attempt in $(seq 1 60); do
		response_file=$(mktemp)
		http_code=$(curl -s -o "$response_file" -w '%{http_code}' "$health_url" || true)
		body=$(<"$response_file")
		rm -f "$response_file"

		if [ "$http_code" = '200' ] && printf '%s' "$body" | rg -q '"ok"\s*:\s*true'; then
			return 0
		fi

		sleep 1
	done

	fail "service did not become healthy at $health_url"
}

request_json() {
	local method url payload cookie_jar response_file http_code body
	method="$1"
	url="$2"
	payload="$3"
	cookie_jar="$4"
	response_file=$(mktemp)

	http_code=$(curl -sS -o "$response_file" -w '%{http_code}' \
		-X "$method" \
		-H 'Content-Type: application/json' \
		-c "$cookie_jar" \
		-b "$cookie_jar" \
		--data "$payload" \
		"$url")
	body=$(<"$response_file")
	rm -f "$response_file"

	if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
		fail "request to $url failed with HTTP $http_code: $body"
	fi

	printf '%s' "$body"
}

start_instance() {
	local cookie_jar base_url bootstrap_body user_body
	cookie_jar=$(mktemp)
	trap 'compose down -v --remove-orphans >/dev/null 2>&1 || true; [ -n "${cookie_jar:-}" ] && rm -f "$cookie_jar"' EXIT INT TERM

	compose down -v --remove-orphans >/dev/null 2>&1 || true
	compose up --build -d
	wait_for_health

	base_url="http://${host}:${port}"

	bootstrap_body=$(request_json 'POST' "$base_url/api/auth/bootstrap" '{"username":"admin-demo","password":"demo12345"}' "$cookie_jar")
	printf '%s' "$bootstrap_body" | rg -q '"ok"\s*:\s*true' || fail 'bootstrap response did not report success'

	user_body=$(request_json 'POST' "$base_url/api/admin/users" '{"username":"user-demo","password":"demo12345"}' "$cookie_jar")
	printf '%s' "$user_body" | rg -q '"ok"\s*:\s*true' || fail 'user creation response did not report success'

	rm -f "$cookie_jar"
	trap - EXIT INT TERM

	cat <<EOF
Manual test instance ready.

URL: http://${host}:${port}
Admin: admin-demo / demo12345
User: user-demo / demo12345

Destroy it with:
npm run test:instance:stop -- --host ${host} --port ${port}
EOF
}

stop_instance() {
	compose down -v --remove-orphans
	printf 'Destroyed test instance at http://%s:%s\n' "$host" "$port"
}

[ "$#" -ge 1 ] || {
	usage
	exit 1
}

command="$1"
shift

parse_args "$@"

host_slug=$(sanitize_name "$host")
project_name="discographic-test-${host_slug}-${port}"
container_name="$project_name"

case "$command" in
start)
	start_instance
	;;
stop)
	stop_instance
	;;
--help | -h | help)
	usage
	;;
*)
	fail "unknown command: $command"
	;;
esac
