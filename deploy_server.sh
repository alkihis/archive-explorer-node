VERSION="1_2"

cd

dir="server_$VERSION"

rm deploy.zip

for found in $(ls server_*)
do
  cp "$found/settings.json" deploy
  cp "$found/misc/deleted_count.json" deploy/misc
  break
done

mv deploy $dir
cd $dir

npm i

echo "Server ready !"
echo "Run 'node build/index.js --prod' in a screen to start server"
