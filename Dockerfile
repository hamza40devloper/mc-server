FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y curl wget
WORKDIR /app
RUN wget -O paper.jar https://fill-data.papermc.io/v1/objects/cfb9281c2657e21ecc8acdaa9efbd6b5b3e873fb5bac4c3b8ba4bba67aa13ee2/paper-26.1.2-65.jar
RUN wget -O playit https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-x86_64 && chmod +x playit
RUN echo "eula=true" > eula.txt
CMD ["sh", "-c", "./playit & java -Xmx512M -Xms512M -jar paper.jar nogui"]
