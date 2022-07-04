FROM openjdk:18-slim

# Install signal-cli
RUN apk add curl
RUN \
  mkdir -p /opt && \
  curl -L https://github.com/AsamK/signal-cli/releases/download/v0.9.2/signal-cli-0.9.2.tar.gz -o /opt/signal-cli.tar.gz && \
  cd /opt && \
  tar -xzf signal-cli.tar.gz && \
  rm signal-cli.tar.gz
ENV PATH="/opt/signal-cli-0.9.2/bin:$PATH"

# Register as Signal user
ARG SIGNAL_USER
ENV SIGNAL_USER=$SIGNAL_USER
ARG SIGNAL_CAPTCHA
RUN signal-cli -u $SIGNAL_USER register --captcha $SIGNAL_CAPTCHA

RUN curl -sL https://deb.nodesource.com/setup_16.x | bash - 
RUN apt-get install -y nodejs

ADD . /app
WORKDIR /app

RUN npm i -g yarn
RUN yarn build

CMD node /app
