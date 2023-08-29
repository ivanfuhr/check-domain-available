# Use an official Node.js runtime as a parent image
FROM node:18.16.0-alpine

# Set the working directory to /app
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Expose port 3333
EXPOSE 3333

# Set the command to start the server
CMD ["npm", "start"]