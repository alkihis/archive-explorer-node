mkdir deploy

cp -R build misc .ssh static package.json settings.json deploy/

zip -r deploy.zip deploy
