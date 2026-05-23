FROM eclipse-temurin:25-jre
RUN apt-get update && apt-get install -y curl wget
WORKDIR /app

# تحميل السيرفر
RUN wget -O paper.jar https://fill-data.papermc.io/v1/objects/cfb9281c2657e21ecc8acdaa9efbd6b5b3e873fb5bac4c3b8ba4bba67aa13ee2/paper-26.1.2-65.jar

# تحميل البلوجن
RUN mkdir -p plugins
RUN wget -O plugins/playit.jar https://github.com/playit-cloud/playit-minecraft-plugin/releases/latest/download/playit-minecraft-plugin.jar

# إعداد الشروط والـ online-mode
RUN echo "eula=true" > eula.txt
RUN echo "online-mode=false" > server.properties

# تشغيل السيرفر مع ربط الكود السري الخاص بك
CMD ["java", "-Xmx512M", "-Xms512M", "-Dplayit.secret=908accd472cf9d785a5f5d182bb60f2b", "-jar", "paper.jar", "nogui"]
