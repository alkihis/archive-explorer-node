current=$1
new=$2

if [ -z "$1" ]
then
  echo "Error: No current version supplied"
  exit
fi

if [ -z "$2" ]
then
  echo "Error: No new version supplied"
  exit
fi

unzip deploy.zip
mv deploy "$new"
cd "$new"

cp "../$current/settings.json" .
cp "../$current/misc/deleted_count.json" ./misc
npm i

echo "Server is ready. Please set the screen"
