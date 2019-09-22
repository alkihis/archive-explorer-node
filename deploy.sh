rm -rf ./static/www/*

cp -R ../archive-explorer-web/build/* ./static/www

mkdir deploy

cp -R build misc .ssh static package.json settings.json deploy/

zip -r deploy.zip deploy

rm -rf deploy
